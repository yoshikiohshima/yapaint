export function toKey(n) {
  return Math.trunc(n * 1000);
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
  return array[array.length - 1];
}

export class Bitmap {
  constructor(id, name) {
    this.name = name; // file name
    this.id = id;
    this.keys = [];
    this.data = new Map();
    // this.data {x, y, width, height, userId}
  }

  add(time, position) {
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
    array.push(position);
  }

  last(time) {
    return findLast(time, this);
  }

  applyTo(canvas, toTime, intf) {
    let timeKey = toKey(toTime);
    let endIndex = findClosestIndex(timeKey, this);
    for (let i = endIndex; i >= 0; i--) {
      let array = this.data.get(this.keys[i]);
      if (array.length > 0) {
        let info = array[array.length - 1];
        intf.drawBitmap(canvas, this.name, info);
        return;
      }
    }
  }

  undo() {
    if (this.keys.length === 0) {return null;}

    let key = this.keys[this.keys.length - 1];
    let array = this.data.get(key);
    let last = array[array.length - 1];
    if (last.message === 'addBitmap') {
      array.pop();
      return [last];
    }

    if (last.message === 'reframeBitmap') {
      for (let i = this.keys.length - 1; i >= 0; i--) {
        let e;
        let ind;
        let key = this.keys[i]
        let array = this.data.get(key);
        for (ind = array.length - 1; ind >= 0; ind--) {
          e = array[ind];
          if (e.message !== 'select' && e.message !== 'reframeBitmap') {
            break;
          }
        }
        if (ind < 0) {
          this.data.delete(key);
          this.keys.splice(i);
        } else {
          array.splice(ind + 1);
          return;
        }
      }
    }
  }
}

export class Stroke {
  constructor(id) {
    this.id = id;
    this.keys = [];
    this.data = new Map();
    // this.data {x0, y0, x1, y1, width, color, userId}
  }

  add(time, newSegment) {
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
    array.push(newSegment);
  }

  last(time) {
    return findLast(time, this);
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
    } else if (this.type === 'finishReframeBitmap') {
      let bitmap = objects.objects[this.info.objectId].object;
      bitmap.add(model.now, this.info);
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
    } else if (this.type === 'finishReframeBitmap') {
      let bitmap = objects.objects[this.info.objectId].object;
      bitmap.undo();
    }
  }
}
