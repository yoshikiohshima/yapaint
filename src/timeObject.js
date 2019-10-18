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

  undo(time) {
    let timeKey = toKey(time);
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
}

export class Objects {
  constructor(id) {
    this.id = id;
    let m1 = toKey(-1);
    this.keys = [m1];
    this.data = new Map();
    this.data.set(m1, [{objects: [], history: [], redoHistory: [], selections: {}}]);
    // this.data {objects: [timeObject], history: [id], redoHistory: [id], selections: {userId: obj}}
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

  get(time, objectId) {
    let last = findLast(time, this);
    return last.objects.find((c) => c.id === objectId);
  }

  applyTo(canvas, toTime, intf) {
    intf.clear(canvas);
    let timeKey = toKey(toTime);
    let last = findLast(toTime, this);
    last.objects.forEach((obj) => obj.applyTo(canvas, toTime, intf));
  }
}
