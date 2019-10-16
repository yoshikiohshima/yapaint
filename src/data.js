// it is logically array, and physically sparse.  All elements have to
// be sortable, and the sort order has to be stable.  It is often the
// case that many elements are added quickly.
// there may be multiple users adding strokes simultaneously. Each chunk is organized by the userId, the user's more action are added to that


// [unambigously quantized timecode] -> {userId: [commans]}

// I assume that getCurrentTime() is stable, in the sense that if you seek to a position, the value is the same.
// For debugging, it needs to quantize the value properly.

export function toKey(n) {
  return Math.trunc(n * 1000);
}

export class Cache {
  resetFor(canvas) {
    this.cache = new Map();
    this.set(toKey(-1), new ImageData(canvas.width, canvas.height).data);
  }

  set(key, object) {
    this.cache.set(key, object);
  }

  get(key) {
    return this.cache.get(key);
  }

  delete(key) {
    return this.cache.delete(key);
  }

  findClosestBitmap(time, commandArray) {
    // there should be always one
    let timeKey = toKey(time);
    let ind = commandArray.findClosestIndex(timeKey);
    for (let i = ind; i >= 0; i--) {
      let k = commandArray.keyAt(i);
      let v = this.get(k);
      if (v) {
        return [i, v];
      }
    }
    return [null, null]; // should not be reached
  }
}

export class Command {
  constructor(type, info) {
    // type: 'stroke','finishStroke', 'addBitmap', 'removeBitmap', 'reframeBitmap',
    //   beginStroke: {start: {x: y}, end: {x, y}, color: string, width, userId} color == 'transparent': erase
    //   stroke: {start: {x: y}, end: {x, y}, color: string, width, userId}
    //   finishStroke: {start: {x: y}, end: {x, y}, color: string, width, userId}
    //   addBitmap: {bitmapNameOrBitmap, x, y, id, userId}
    //   removeBitmap: {id, userId}
    //   reframeBitmap: {id, startx, starty, endx, endy, useerId}
    this.type = type;
    this.info = info;
  }

  doOn(canvas, intf) {
    if (this.type === 'test') {
    } else if (this.type === 'beginStroke') {
    } else if (this.type === 'stroke') {
      intf.newSegment(canvas, this.info);
    } else if (this.type === 'clear') {
      intf.clear(canvas);
    }
  }
}

export class CommandArray {
  constructor(threshold) {
    let m1 = toKey(-1);
    this.keys = [m1];
    this.data = new Map();
    this.data.set(m1, []);
    this.threshold = threshold || 128; // 1024
    this.uncachedCount = 0;
    this.willCacheWhenLeave = null;
    this.commandCount = 0;
  }

  getCommandCount() {
    return this.commandCount;
  }

  applyCommandsTo(canvas, toTime, cache, intf) {
    let toTimeKey = toKey(toTime);
    let [index, bitmap] = cache.findClosestBitmap(toTime, this);
    this.applyBitmap(canvas, bitmap);

    let i = index + 1;
    
    while (true) {
      if (i >= this.keys.length || this.keys[i] > toTimeKey) {break;}
      let array = this.data.get(this.keys[i]);
      array.forEach((c) => c.command.doOn(canvas, intf));
      i = i + 1;
    }
  }

  applyBitmap(canvas, bits) {
    if (!canvas) {
      console.log("apply: ", bits);
      return;
    }

    canvas.getContext('2d').putImageData(new ImageData(bits, canvas.width, canvas.height), 0, 0);
  }

  add(time, userId, command) {
    let timeKey = toKey(time);
    let [ind, toAdd] = this.findIndexFor(timeKey, 0, this.keys.length);
    if (toAdd) {
      this.keys.splice(ind, 0, timeKey);
    }
    
    let array = this.data.get(timeKey);
    if (!array) {
      array = [];
      this.data.set(timeKey, array);
    }
    array.push({command: command, userId: userId});

    this.uncachedCount++;
    this.commandCount++;
    if (this.uncachedCount > this.threshold) {
      this.willCacheWhenLeave = timeKey;
      this.uncachedCount = 0;
    }
  }

  cache(cache, time, value) {
    let timeKey = toKey(time);
    cache.set(timeKey, value);
    this.uncachedCount = 0;
  }

  leave(time, canvas, cache) {
    let timeKey = toKey(time);
    if (this.willCacheWhenLeave === timeKey) {
      this.willCacheWhenLeave = null;
      if (cache.get(timeKey)) {
        cache.delete(timeKey);
      }
      let bits = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      cache.set(timeKey, bits);
    }
  }
      
  findIndexFor(timeKey, low, high) { // low is inclusive high is exclusive
    if (high === low) {
      return [low, true];
    }

    if (high - 1 === low) {
      if (timeKey < this.keys[low]) {
        return [low, true];
      }
      if (timeKey === this.keys[low]) {
        return [low, false];
      }
      return [low + 1, true];
    }

    let mid = Math.floor((high + low) / 2);
    if (timeKey < this.keys[mid]) {
      return this.findIndexFor(timeKey, low, mid);
    } else if (timeKey === this.keys[mid]) {
      return [mid, false];
    } else {
      return this.findIndexFor(timeKey, mid, high);
    }
  }

  findClosestIndex(timeKey) {
    let [ind, notFound] = this.findIndexFor(timeKey, 0, this.keys.length);
    return notFound ? ind - 1 : ind;
  }

  keyAt(ind) {
    return this.keys[ind];
  }

  findLastUndoable(ind) {
    for (let k = ind; k >= 0; k--) {
      let array = this.data.get(this.keys[k]);
      for (let i = array.length - 1; i >= 0; i--) {
        let c = array[i];
        if (c.command.type === 'finishStroke' || c.command.type === 'clear') {
          return [k, i, c];
        }
      }
    }
    return [null, null, null];
  }

  getUndo(timeInd, arrayInd, command) {
    if (command.command.type === 'clear') {
      let array = this.data.get(this.keys[timeInd]);
      array.splice(arrayInd, 1);
      this.commandCount--;
      return [command];
    }
    if (command.command.type === 'finishStroke') {
      let strokeId = command.command.info.strokeId;
      let result = this.moveStrokeInto(timeInd, arrayInd, strokeId);
      result.push(command);
      this.commandCount -= result.length;
      return result;
    }
  }

  moveStrokeInto(timeInd, arrayInd, strokeId) {
    let result = [];
    for (let k = timeInd; k >= 0; k--) {
      let array = this.data.get(this.keys[k]);
      array.splice(arrayInd, 1);
      let [undoArray, newArray] = this.splitArray(array, (c) => (c.command.type === 'stroke' || c.command.type === 'beginStroke') && c.command.info.strokeId === strokeId);
      result = [...undoArray, ...result];
      this.data.set(this.keys[k], newArray);
      if (undoArray.findIndex((c) => c.command.type === 'beginStroke') >= 0) {
        break;
      }
    }
    return result;
  }

  splitArray(array, func) {
    let t = [];
    let f = [];
    for (let i = 0; i < array.length; i++) {
      let elem = array[i];
      if (func(elem)) {
        t.push(elem);
      } else {
        f.push(elem);
      }
    }
    return [t, f];
  }

  undo(time) {
    let timeKey = toKey(time);
    let ind = this.findClosestIndex(timeKey);
    let [timeInd, arrayInd, command] = this.findLastUndoable(ind);
    if (!command) {return null;}
    return this.getUndo(timeInd, arrayInd, command);
  }
}
