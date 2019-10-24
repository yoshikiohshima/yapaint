function toKey(n) {
  return Math.trunc(n * 1000);
}

export function newId() {
  function hex() {
    let r = Math.random();
    return Math.floor(r * 256).toString(16).padStart(2, "0");
  }
  return`${hex()}${hex()}${hex()}${hex()}`;
}

function findIndexFor(timeKey, obj, low, high) { // low is inclusive high is exclusive
  if (high === low) {
    return [low, true];
  }

  if (high - 1 === low) {
    if (timeKey < obj.keys[low]) {
      return [low, true];
    }
    if (timeKey === obj.keys[low]) {
      return [low, false];
    }
    return [low + 1, true];
  }

  let mid = Math.floor((high + low) / 2);
  if (timeKey < obj.keys[mid]) {
    return findIndexFor(timeKey, obj, low, mid);
  } else if (timeKey === obj.keys[mid]) {
    return [mid, false];
  } else {
    return findIndexFor(timeKey, obj, mid, high);
  }
}

function findClosestIndex(timeKey, obj) {
  let [ind, notFound] = findIndexFor(timeKey, obj, 0, obj.keys.length);
  return notFound ? ind - 1 : ind;
}

function findLast(time, obj) {
  let timeKey = toKey(time);
  let ind = findClosestIndex(timeKey, obj);
  let array = obj.data.get(obj.keys[ind]);
  if (!array) {return undefined;}
  return array[array.length - 1];
}

export class Transform {
  static scale(time, n) {
    let t = new Transform();
    let ary = [n, 0, 0, 0, n, 0];
    t.add(time, {message: 'scale', transform: ary});
    return t;
  }

  static translate(time, x, y) {
    let t = new Transform();
    let ary = [1, 0, x, 0, 1, y];
    t.add(time, {message: 'translate', transform: ary});
    return t;
  }

  static rotate(time, theta) {}

  constructor() {
    let m1 = toKey(-1);
    this.keys = [m1];
    this.data = new Map();
    this.data.set(m1, [{message: 'identity', transform: [1, 0, 0, 0, 1, 0]}]);
    // this.data {message: <string, transform: [a11, a12, a13, a21, a22, a23]}
  }

  add(time, info) {
    let timeKey = toKey(time);
    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);
    if (toAdd) {
      this.keys.splice(ind, 0, timeKey);
    }
    
    let array = this.data.get(timeKey);
    if (!array) {
      array = [];
      this.data.set(timeKey, array);
    }
    array.push(info);
  }

  last(time) {
    return findLast(time, this);
  }

  transformPoint(time, x, y) {
    let r = this.last(time).transform;
    return {x: r[0] * x + r[1] * y + r[2], y: r[3] * x + r[4] * y + r[5]};
  }

  setTranslation(time, x, y) {
    let last = findLast(time, this).transform;
    this.add(time, [last[0], last[1], x, last[3], last[4], y]);
  }

  undo(time, moveId) {
    let timeKey = toKey(time);
    let nowInd = findClosestIndex(timeKey, this);
    for (let i = nowInd; i >= 0; i--) {
      let e;
      let ind;
      let key = this.keys[i]
      let array = this.data.get(key);
      for (ind = array.length - 1; ind >= 0; ind--) {
        e = array[ind];
        if (e.message === 'firstReframe' && e.moveId === moveId) {
          break;
        }
      }
      if (ind < 0) {
        this.data.delete(key);
        this.keys.splice(i);
      } else {
        array.splice(ind);
        return;
      }
    }
  }
}

export class Bitmap {
  constructor(id, name, width, height) {
    this.id = id;
    this.transform = new Transform();
    let m1 = toKey(-1);
    this.keys = [m1];
    this.data = new Map();
    this.data.set(m1, [{name, width, height}]);
    // this.data {name, width, height}
  }

  addTransform(time, transform) {
    this.transform.add(time, transform);
  }

  add(time, info) {
    let timeKey = toKey(time);
    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);
    if (toAdd) {
      this.keys.splice(ind, 0, timeKey);
    }
    
    let array = this.data.get(timeKey);
    if (!array) {
      array = [];
      this.data.set(timeKey, array);
    }
    array.push(info);
  }

  last(time) {
    return findLast(time, this);
  }

  includesPoint(time, x, y) {
    let last = this.last(time);
    let o = this.transform.transformPoint(time, 0, 0);
    let c = this.transform.transformPoint(time, last.width, last.height);
    return o.x <= x && x < c.x && o.y <= y && y < c.y;
  }

  getRect(time) {
    let last = this.last(time);
    let transform = this.transform.last(time).transform;
    return {name: last.name, width: last.width, height: last.height, transform: transform};
  }

  applyTo(canvas, time, intf) {
    let last = this.last(time);
    intf.drawBitmap(canvas, last.name, this.getRect(time));
  }

  undo(time) {
    if (this.keys.length === 0) {return null;}

    let timeKey = toKey(time);
    let nowInd = findClosestIndex(timeKey, this);

    let array = this.data.get(this.keys[nowInd]);
    let last = array[array.length - 1];
    let moveId;
    
    if (last.message === 'finishReframe') {
      for (let i = nowInd; i >= 0; i--) {
        let e;
        let ind;
        let key = this.keys[i]
        let array = this.data.get(key);
        for (ind = array.length - 1; ind >= 0; ind--) {
          if (i === this.keys.length - 1 && ind === array.length - 1) {continue;}
          e = array[ind];
          if (e.message === 'firstReframe') {
            moveId = e.moveId;
            break;
          }
        }
        if (ind <= 0) {
          this.data.delete(key);
          this.keys.splice(i);
        } else {
          array.splice(ind);
          
        }
        if (moveId) {
          this.transform.undo(time, moveId);
          return;
        }
      }
    }
  }
}

export class Stroke {
  constructor(id) {
    this.id = id;
    this.transform = new Transform();
    this.keys = [];
    this.data = new Map();
    // this.data {x0, y0, x1, y1, width, color, ox, oy, cx, cy}
    //           | select
    //           | reframe
  }

  add(time, info) {
    let last = this.last(time) || {ox: Infinity, oy: Infinity, cx: -Infinity, cy: -Infinity};
    let timeKey = toKey(time);
    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);
    if (toAdd) {
      this.keys.splice(ind, 0, timeKey);
    }
    
    let array = this.data.get(timeKey);
    if (!array) {
      array = [];
      this.data.set(timeKey, array);
    }

    let newInfo;
    if (info.message === "select") {
      newInfo = info;
    } else {
      newInfo = {...info,
                 ox: Math.min(last.ox, info.x0, info.x1), 
                 oy: Math.min(last.oy, info.y0, info.y1), 
                 cx: Math.max(last.cx, info.x0, info.x1), 
                 cy: Math.max(last.cy, info.y0, info.y1)}
    }
    array.push(newInfo);
  }

  addTransform(time, transform) {
    this.transform.add(time, transform);
  }

  last(time) {
    return findLast(time, this);
  }

  includesPoint(time, x, y) {
    let rect = this.last(time);
    return (rect.ox <= x && x < rect.cx &&
            rect.oy <= y && y < rect.cy);
  }

  getRect(time) {
    let rect = this.last(time);
    return {ox: rect.ox, oy: rect.oy, cx: rect.cx, cy: rect.cy};
  }

  applyTo(canvas, toTime, intf) {
    let timeKey = toKey(toTime);
    let endIndex = findClosestIndex(timeKey, this);
    for (let i = 0; i <= endIndex; i++) {
      let array = this.data.get(this.keys[i]);
      array.forEach((segment) => intf.newSegment(canvas, segment));
    }
  }

  undo() {
    if (this.keys.length === 0) {return null;}
    let array = this.data[this.keys[0]];
    return array[0];
  }
}

export class Objects {
  constructor(id) {
    this.id = id;
    this.objects = {}; // {id: {object: object, from: fromTimeKey, to: toTimeKey | undefined}
  }

  addObject(time, obj) {
    this.objects[obj.id] = {object: obj, from: toKey(time)};
  }

  undoAddObject(object) {
    let obj = this.objects[object.id].object;
    delete this.objects[object.id];
    return obj;
  }

  get(time, objectId) {
    let timeKey = toKey(time);
    let info = this.objects[objectId];
    if (info.from <= timeKey &&
        (info.to === undefined || timeKey < info.to)) {
      return info.object;
    }
    return null;
  }

  liveObjectsDo(time, func) {
    let timeKey = toKey(time);

    for (let k in this.objects) {
      let obj = this.get(time, k);
      if (obj) {
        func(obj);
      }
    }
  }

  liveObjects(time) {
    let timeKey = toKey(time);
    let result = [];

    for (let k in this.objects) {
      let obj = this.get(time, k);
      if (obj) {
        result.push(obj);
      }
    }
    return result;
  }

  undo(id, time) {
    let obj = this.get(time, id);
    return obj.undo();
  }

  killObjects(time) {
    let timeKey = toKey(time);
    let undo = {};
    this.liveObjectsDo(time, (obj) => {
      undo[obj.id] = {oldTo: this.objects[obj.id].to, newTo: timeKey};
      this.objects[obj.id].to = timeKey;
    });
    return undo;
  }

  applyTo(canvas, time, intf) {
    intf.clear(canvas);
    this.liveObjectsDo(time, (obj) => obj.applyTo(canvas, time, intf));
  }
}

export class Action {
  constructor(type, info) {
    this.type = type;
    this.info = info;
  }

  redo(model) {
    let objects = model.objects;
    if (this.type === 'clear') {
      for (let k in this.info) {
        objects.objects[k].to = this.info[k].newTo;
      }
    } else if (this.type === 'addObject') {
      objects.addObject(model.now, this.info);
    } else if (this.type === 'finishReframe') {
      let obj = objects.objects[this.info.objectId].object;
      let last = obj.last(model.now);
      let moveId = newId();
      obj.add(model.now, {message: 'firstReframe', moveId, name: last.name, width: last.width, height: last.height});
      obj.addTransform(model.now, {message: 'firstReframe', moveId, transform: this.info.oldTransform});
      obj.add(model.now, {message: 'finishReframe', name: last.name, width: last.width, height: last.height});
      
      obj.addTransform(model.now, {message: 'reframe', transform: this.info.newTransform});
    }
  }

  undo(model) {
    let objects = model.objects;
    if (this.type === 'clear') {
      for (let k in this.info) {
        objects.objects[k].to = this.info[k].oldTo;
      }
    } else if (this.type === 'addObject') {
      objects.undoAddObject(this.info);
    } else if (this.type === 'finishReframe') {
      let obj = objects.objects[this.info.objectId].object;
      obj.undo(model.now);
    }
  }
}
