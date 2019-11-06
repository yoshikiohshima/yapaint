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

  static compose(o, t){
    let result = new Array(6);

    result[0] = o[0] * t[0] + o[1] * t[3];
    result[1] = o[0] * t[1] + o[1] * t[4];
    result[2] = o[0] * t[2] + o[1] * t[5] + o[2];

    result[3] = o[3] * t[0] + o[4] * t[3];
    result[4] = o[3] * t[1] + o[4] * t[4];
    result[5] = o[3] * t[2] + o[4] * t[5] + o[5];

    return result;
  }

  static transformPoint(t, x, y) {
    return {x: t[0] * x + t[1] * y + t[2], y: t[3] * x + t[4] * y + t[5]};
  }

  static invertPoint(t, x, y) {
    let det = 1 / (t[0] * t[4] - t[1] * t[3]);

    let n = [det * t[4], det * -t[1], -t[2], det * -t[3], det * -t[0], -t[5]];

    return this.transformPoint(n, x, y);
  }

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

  get(time) {
    return findLast(time, this);
  }

  transformPoint(time, x, y) {
    let r = this.get(time).transform;
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
    this.name = name;
    let m1 = toKey(-1);
    this.keys = [m1];
    this.data = new Map();
    this.data.set(m1, [{width, height}]);
    // this.data {name, width, height}, in the inherent size
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

  get(time) {
    return findLast(time, this);
  }

  includesPoint(time, x, y) {
    // get the current values, and test the screen point in the transformed local coorinate
    let last = this.get(time);
    if (!last) {return false;}
    let o = this.transform.transformPoint(time, 0, 0);
    let c = this.transform.transformPoint(time, last.width, last.height);
    return o.x <= x && x < c.x && o.y <= y && y < c.y;
  }

  getRect(time) {
    let last = this.get(time);
    let transform = this.transform.get(time).transform;
    return {width: last.width, height: last.height, transform: transform};
  }

  reframe(time, info) {
    let rect = this.getRect(time);
    let t = rect.transform;
    if (info.firstReframe) {
      let moveId = newId();
      this.add(time, {message: 'firstReframe', moveId, width: rect.width, height: rect.height});
      this.addTransform(time, {message: 'firstReframe', moveId, transform: rect.transform});
    } else {
      let newTransform = info.transform;
      this.addTransform(time, {message: 'reframe', transform: newTransform});
    }
  }

  finishReframe(time, info) {
    let last = this.get(time);
    let transform = this.transform.get(time).transform;

    this.add(time, {message: 'finishReframe', width: last.width, height: last.height});

    return new Action('finishReframe', {
      message: 'reframe', objectId: info.objectId, width: last.width, height: last.height, oldTransform: info.transform, newTransform: transform
    });
  }

  applyTo(canvas, time, intf) {
    let last = this.get(time);
    intf.drawBitmap(canvas, this.id, this.getRect(time));
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
    // this.data {x0, y0, x1, y1, lineWidth, color, ox, oy, width, height}  // all in local
    //           | reframe
  }

  add(time, info) {
    let last = this.get(time) || {ox: Infinity, oy: Infinity, cx: -Infinity, cy: -Infinity, width: 0, height: 0};
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
    if (info.message !== "stroke") {
      newInfo = info;
    } else {
      let ox = Math.min(last.ox, info.x0, info.x1);
      let oy = Math.min(last.oy, info.y0, info.y1);
      let cx = Math.max(last.cx, info.x0, info.x1);
      let cy = Math.max(last.cy, info.y0, info.y1);
      newInfo = {...info,
                 ox,oy,
                 cx, cy,
                 width: cx - ox,
                 height: cy - oy};
    }
    array.push(newInfo);
  }

  addTransform(time, transform) {
    this.transform.add(time, transform);
  }

  get(time) {
    return findLast(time, this);
  }

  includesPoint(time, x, y) {
    let last = this.get(time);
    let o = this.transform.transformPoint(time, last.ox, last.oy);
    let c = this.transform.transformPoint(time, last.cx, last.cy);
    return o.x <= x && x < c.x && o.y <= y && y < c.y;
  }

  getRect(time) {
    let last = this.get(time);
    let transform = this.transform.get(time).transform;
    return {ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height, transform: transform};
    // return {ox: rect.ox, oy: rect.oy, cx: rect.cx, cy: rect.cy};
  }

  reframe(time, info) {
    let rect = this.getRect(time);
    let t = rect.transform;
    if (info.firstReframe) {
      let moveId = newId();
      this.add(time, {message: 'firstReframe', moveId, ox: rect.ox, oy: rect.oy, cx: rect.cx, cy: rect.cy, width: rect.width, height: rect.height});
      this.addTransform(time, {message: 'firstReframe', moveId, transform: rect.transform});
    } else {
      let newTransform = info.transform;
      this.addTransform(time, {message: 'reframe', transform: newTransform});
    }
  }

  finishReframe(time, info) {
    let last = this.get(time);
    let transform = this.transform.get(time).transform;

    this.add(time, {message: 'finishReframe', ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height});

    return new Action('finishReframe', {
      message: 'reframe', objectId: info.objectId, ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height, oldTransform: info.transform, newTransform: transform
    });
  }

  applyTo(canvas, toTime, intf) {
    let timeKey = toKey(toTime);
    let endIndex = findClosestIndex(timeKey, this);
    for (let i = 0; i <= endIndex; i++) {
      let array = this.data.get(this.keys[i]);
      array.forEach((segment) => {
        let transform = this.transform.get(toTime).transform;
        intf.newSegment(canvas, segment, transform);
      });
    }
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
    if (!info) {return null;}
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

  killObject(time, objectId) {
    let timeKey = toKey(time);
    let undo = {};
    let info = this.objects[objectId];
    undo[objectId] = {oldTo: info.to, newTo: timeKey};
    info.to = timeKey;
    return undo;
  }

  applyTo(canvas, time, intf) {
    intf.clear(canvas);
    this.liveObjectsDo(time, (obj) => obj.applyTo(canvas, time, intf));
  }

  some(time) {
    let result = this.liveObjects(time);
    if (result.length > 0) {
      return result[0];
    }
    return null;
  }
}

export class Action {
  constructor(type, info) {
    this.type = type;
    this.info = info;
  }

  redo(model, time) {
    let objects = model.objects;
    if (this.type === 'clear') {
      for (let k in this.info) {
        objects.objects[k].to = this.info[k].newTo;
      }
    } else if (this.type === 'addObject') {
      objects.addObject(time, this.info);
    } else if (this.type === 'finishReframe') {
      let obj = objects.objects[this.info.objectId].object;
      let last = obj.get(time);
      let moveId = newId();
      obj.add(time, {message: 'firstReframe', moveId, width: last.width, height: last.height});
      obj.addTransform(time, {message: 'firstReframe', moveId, transform: this.info.oldTransform});
      obj.add(time, {message: 'finishReframe', width: last.width, height: last.height});
      
      obj.addTransform(time, {message: 'reframe', transform: this.info.newTransform});
    }
  }

  undo(model, time) {
    let objects = model.objects;
    if (this.type === 'clear') {
      for (let k in this.info) {
        objects.objects[k].to = this.info[k].oldTo;
      }
    } else if (this.type === 'addObject') {
      objects.undoAddObject(this.info);
    } else if (this.type === 'finishReframe') {
      let obj = objects.objects[this.info.objectId].object;
      obj.undo(time);
    }
  }
}
