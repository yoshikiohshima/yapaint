/* global YT */

import * as Croquet from '@croquet/croquet';

import {Objects, Stroke, Bitmap, Action, Transform, newId} from './timeObject.js';
import {dragger} from './dragger.js';
import {AssetManager} from './assetManager.js';

let isLocal = true;
let session;

let bitmaps = {};

const VIEW_EARLY_DRAW = false;

class FutureHandler {
  constructor(tOffset) {
    this.tOffset = tOffset || 0;
  }

  setup(target) {
    let tOffset = this.tOffset
    return new Proxy(target, {
      get(_target, property) {
        if (typeof target[property] === "function") {
          return new Proxy(target[property], {
            apply(method, _this, args) {
              setTimeout(() => method.apply(target, args), tOffset);
            }
          });
        }
      }
    });
  }
}

class MockModel {
  static create() {return new this();}
  static register() {}

  constructor() {
    this.id = 'abc';
    this.start = Date.now();
  }
  init() {}
  subscribe() {}
  publish(id, message, data) {
    if (session && session.view) {
      session.view.dispatch(data);
    }
  }

  future(tOffset = 0) {
    return new FutureHandler(tOffset).setup(this);
  }

  now() {
    return Date.now() - this.start;
  }
}

class MockView {
  constructor(model) {
    this.id = 'def';
    this.viewId = this.id;

    this.start = Date.now();
  }
  subscribe() {}

  now() {
    return Date.now() - this.start;
  }
}

let M = isLocal ? MockModel : Croquet.Model;
let V = isLocal ? MockView : Croquet.View;

class MockReflector {
  constructor(model, view) {
    this.model = model;
    this.view = view;
  }

  dispatch(arg) {
    if (arg === undefined) {return;}
    let mth = this.view.messages[arg.message];
    if (!mth || !this.view[mth]) {return;}
    let value = this.view[mth](arg);
    if (value === undefined) {return;}
    
    mth = this.model.messages[value.message];
    if (!mth || !this.model[mth]) {return;}
    value = this.model[mth](value);
    if (value === undefined) {return;}
    this.view.dispatch(value);
  }

  frame(time) {
    this.view.update(time);
    window.requestAnimationFrame(this.frame.bind(this));
  }
}

function makeMockReflector(modelClass, viewClass) {
  let m = modelClass.create();
  m.init();
  let v = new viewClass(m);
  
  let mockReflector = new MockReflector(m, v);
  m.viewJoin(v.id);
  
  mockReflector.frame.bind(mockReflector)();

  return mockReflector;
}

class Interface {

  newSegment(canvas, obj, transform) {
    let {x0, y0, x1, y1, color} = obj;
    let ctx = canvas.getContext('2d');

    ctx.save();

    if (color === 'erase') {
      ctx.strokeStyle = '#ffffffff';
      ctx.globalCompositeOperation = "destination-out";
    } else {
      ctx.strokeStyle = color;
      ctx.globalCompositeOperation = "source-over";
    }
    
    ctx.lineWidth = color === 'erase' ? 6 : 2;

    ctx.transform(transform[0], transform[3], transform[1], transform[4], transform[2], transform[5]);

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);

    ctx.stroke();

    ctx.restore();
  }

  clear(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  drawBitmap(canvas, name, info) {
    let glyph = bitmaps[name];
    if (!glyph) {return;}
    let t = info.transform;
    let x = info.width;
    let y = info.height;
    let p = {x: t[0] * x + t[1] * y + t[2], y: t[3] * x + t[4] * y + t[5]};
    canvas.getContext('2d').drawImage(glyph, 0, 0, glyph.width, glyph.height, t[2], t[5], p.x - t[2], p.y - t[5]);
  }

  drawFrame(canvas, info) {
    let transform = info.transform;
    let ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b1b1bf8c';

    let t0 = Transform.transformPoint(transform, info.ox || 0, info.oy || 0);
    let t1;

    t1 = Transform.transformPoint(transform, info.cx || info.width || 0, info.cy || info.height || 0);
    
    // ctx.save();
    // ctx.transform(t[0], t[3], t[1], t[4], t[2], t[5]);
    
    ctx.beginPath();
    ctx.rect(t0.x, t0.y, t1.x - t0.x, t1.y - t0.y);
    ctx.stroke();
    //ctx.restore();
  }

  set4Handles(info, resizers) {
    let transform = info.transform;
    let width = info.width;
    let height = info.height;

    let t0 = Transform.transformPoint(transform, info.ox || 0, info.oy || 0);
    let t1 = Transform.transformPoint(transform, info.cx || width || 0 , info.cy || height || 0);

    for (let k in resizers) {
      let handle = resizers[k];
      let coord = handle.coord;
      if (coord.name === 'bottomRight') {
        handle.style.setProperty("display", "inherit");
      } else {
        handle.style.setProperty("display", "none");
      }
      handle.style.setProperty("left", t0.x - 4 + (coord.x * (t1.x - t0.x)) + "px");
      handle.style.setProperty("top", t0.y - 4 + (coord.y * (t1.y - t0.y)) + "px");
    }
  }
}

class DrawingModel extends M {
  static types() {
    return {
      Bitmap: {
        cls: Bitmap,
        write: (c) => {
          let {id, name, transform, keys, data} = c;
          return {id, name, transform, keys, data};
        },
        read: (obj) => {
          let b = new Bitmap(obj.id);
          b.name = obj.name;
          b.keys = obj.keys;
          b.data = obj.data;
          return b;
        }
      },
      Stroke: {
        cls: Stroke,
        write: (c) => {
          let {id, transform, keys, data} = c;
          return {id, transform, keys, data};
        },
        read: (obj) => {
          let s = new Stroke(obj.id);
          s.keys = obj.keys;
          s.data = obj.data;
          return s;
        }
      },
      Transform: {
        cls: Transform,
        write: (c) => {
          let {keys, data} = c;
          return {keys, data};
        },
        read: (obj) => {
          let t = new Transform();
          t.keys = obj.keys;
          t.data = obj.data;
        }
      },
      Objects: {
        cls: Objects,
        write: (c) => {
          let {id, objects} = c;
          return {id, objects};
        },
        read: (obj) => {
          let o = new Objects(obj.id);
          o.objects = obj.objects;
          return o;
        }
      },
      Action: {
        cls: Action,
        write: (c) => {
          let {type, info} = c;
          return {type, info};
        },
        read: (obj) => {
          return new Action(obj.type, obj.info);
        }
      }
    }
  }

  actuallyReset() {
    this.objects = new Objects(newId());
    this.isPlaying = false;
    this.startTime = null;
    this.pausedTime = null;

    this.history = [];
    this.redoHistory = [];
    this.selections = {};
    this.assets = {};
    this.videoAsset = null;
  }

  init() {
    this.actuallyReset();

    this.messages = {
      'beginStroke': 'beginStroke',
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'addBitmap': 'addBitmap',
      'reframe': 'reframe',
      'finishReframe': 'finishReframe',
      'clear': 'clear',
      'reset': 'reset',
      'delete': 'delete',
      'undo': 'undo',
      'redo': 'redo',
      'select': 'select',
      'unselect': 'unselect',
      // ---
      'seek': 'seek',
      'addImage': 'addImage',
      'loadImage': 'loadImage',
      'addVideo': 'addVideo',
      'loadVideo': 'loadVideo',
      'setPlayState': 'setPlayState',
      'updateTime': 'updateTime',
    };

    this.subscribe(this.sessionId, "view-join", this.viewJoin);
    this.subscribe(this.sessionId, "view-exit", this.viewExit);

    this.subscribe(this.id, "message", this.dispatch);
    window.model = this;
  }

  dispatch(arg) {
    if (arg === undefined) {return;}
    let mth = this.messages[arg.message];
    if (!mth || !this[mth]) {return undefined;}
    let value = this[mth](arg);
    if (value === undefined) {return undefined;}
    if (isLocal) {
      session.view.dispatch(value);
    } else {
      this.publish(this.id, "message-m", value);
    }
  }

  addSelection(userId, obj) {
    this.selections[userId] = obj;
  }

  removeSelection(userId) {
    if (userId) {
      delete this.selections[userId];
    } else {
      this.selections = {};
    }
  }

  viewJoin(viewId) {
    window.model = this;
    console.log('join: ', viewId);
  }

  viewExit(viewId) {console.log('leave: ', viewId);}

  beginStroke(info) {
    this.removeSelection(info.userId);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  stroke(info) {
    let obj = this.objects.get(info.time, info.objectId);

    if (!obj) {
      obj = new Stroke(info.objectId);
      obj.addTransform(info.time, {message: 'new', transform: [1, 0, 0, 0, 1, 0]});
      this.objects.addObject(info.time, obj);
      this.history.push(new Action('addObject', obj));
    }
    
    obj.add(info.time, info);
    return info;
  }

  finishStroke(info) {
    return info;
  }

  reframe(info) {
    let obj = this.objects.get(info.time, info.objectId);
    if (!obj) {return;} // it is possible that another client just has cleared this object

    obj.reframe(info.time, info);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  finishReframe(info) {
    let obj = this.objects.get(info.time, info.objectId);
    if (!obj) {return;}

    let action = obj.finishReframe(info.time, info);
    this.history.push(action);

    return info;
  }

  select(info) {
    let obj = this.objects.get(info.time, info.objectId);
    let userId = info.userId;
    if (!obj) {return;} // it is possible that another client just has cleared this object
    
    this.addSelection(userId, obj);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  unselect(info) {
    this.removeSelection(info.userId);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  clear(info) {
    let undo = this.objects.killObjects(info.time);
    this.history.push(new Action('clear', undo));
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  reset(info) {
    this.actuallyReset({});
    return {message: 'reset'};
  }

  delete(info) {
    let obj = this.selections[info.userId];
    if (!obj) {return undefined;}

    let undo = this.objects.killObject(info.time, obj.id);
    this.history.push(new Action('clear', undo));
    this.removeSelection();
    delete this.assets[obj.id];
    
    return {message: 'updateScreen'};
  }

  undo(info) {
    if (this.history.length === 0) {return undefined;}
    let action = this.history.pop();
    this.redoHistory.push(action);
    action.undo(this, info.time);
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  redo(info) {
    if (this.redoHistory.length === 0) {return undefined;}
    let action = this.redoHistory.pop();
    action.redo(this, info.time);
    this.history.push(action);
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  addImage(info) {
    let {assetDescriptor, objectId} = info;
    let displayName = assetDescriptor.displayName;
    let x = assetDescriptor.dropPoint.x || 0;
    let y = assetDescriptor.dropPoint.y || 0;
    this.removeSelection(info.userId);
    let obj = new Bitmap(objectId, displayName, info.width, info.height);
    obj.addTransform(info.time, {message: 'new', transform: [1, 0, x, 0, 1, y]});
    this.objects.addObject(info.time, obj);
    this.history.push(new Action('addObject', obj));
    this.assets[objectId] = info.assetDescriptor;
    return {message: 'loadImage', assetDescriptor: info.assetDescriptor, objectId: objectId};
  }

  addVideo(info) {
    this.actuallyReset();
    this.videoAsset = info.assetDescriptor;
    return {message: 'loadVideo', assetDescriptor: info.assetDescriptor,
            width: info.width, height: info.height, duration: info.duration};
  }

  setPlayState(info) {
    let {isPlaying, startTime, pausedTime} = info;
    if (isPlaying !== undefined) {this.isPlaying = isPlaying;}
    if (startTime !== undefined) {this.startTime = startTime;}
    if (pausedTime !== undefined) {this.pausedTime = pausedTime;}

    return info;
  }
}

DrawingModel.register();

class DrawingView extends V {
  constructor(model) {
    super(model);
    this.model = model;
    this.modelId = model.id;
    this.lastPoint = null;
    this.color = 'black';
    this.videoTime = 0;
    
    this.resizers = {};

    this.isSynced = false;

    this.messages = {
      'mouseDown': 'mouseDown',
      'mouseMove': 'mouseMove',
      'mouseUp': 'mouseUp',
      'keyboard': 'keyboard',
      'assetsDrop': 'assetsDrop',
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'resetPressed': 'resetPressed',
      'clearPressed': 'clearPressed',
      'goStopPressed': 'goStopPressed',
      'backwardPressed': 'backwardPressed',
      'forwardPressed': 'forwardPressed',
      'timeChanged': 'timeChanged',
      'undoPressed': 'undoPressed',
      'redoPressed': 'redoPressed',
      'addBitmapPressed': 'addBitmapPressed',
      'addBitmapSelected': 'addBitmapSelected',
      'cornerReframe': 'cornerReframe',
      'updateScreen': 'updateScreen',
      'finishReframe': 'finishReframe',
      'load': 'load',
      'addAsset': 'addAsset',
      'loadImage': 'loadImage',
      'loadVideo': 'loadVideo',
      'setPlayState': 'setPlayState',
      'atEnd': 'atEnd',
      'reset': 'reset',
    };

    this.subscribe(this.modelId, "message-m", this.dispatch);
    this.subscribe(this.viewId, "synced", this.synced);

    this.content = document.querySelector("#draw-content");

    this.handlers = {
      mousedown: (evt) => this.dispatch(Object.assign(
        {message: 'mouseDown'}, this.cookEvent(evt))),
      mousemove: (evt) => this.dispatch(Object.assign(
        {message: 'mouseMove'}, this.cookEvent(evt))),
      mouseup: (evt) => this.dispatch(Object.assign(
        {message: 'mouseUp'}, this.cookEvent(evt))),
      keyboard: (evt) => this.dispatch(Object.assign(
        {message: 'keyboard'}, this.cookEvent(evt))),
      drop: (evt) => this.drop(this.dropEvent(evt)),
      drag: (evt) => this.drag(evt),
      clearHandler: (evt) => this.dispatch({message: 'clearPressed'}),
      resetHandler: (evt) => this.dispatch({message: 'resetPressed'}),
      colorHandler: (evt) => this.setColor(evt.target.id),
      timeHandler: (evt) => this.dispatch(
        {message: 'timeChanged', time: this.elements.time.valueAsNumber}),
      goStopHandler: (evt) => this.dispatch({message: 'goStopPressed'}),
      backwardHandler: (evt) => this.dispatch({message: 'backwardPressed'}),
      forwardHandler: (evt) => this.dispatch({message: 'forwardPressed'}),
      undoHandler: (evt) => this.dispatch({message: 'undoPressed'}),
      redoHandler: (evt) => this.dispatch({message: 'redoPressed'}),
      addBitmapHandler: (evt) => this.addBitmapPressed(),
      addBitmapSelectedHandler: (evt) => this.dispatch({message: 'addBitmapSelected', target: evt.target})
    };

    this.elements = {};
    ['body', 'canvas', 'clearButton', 'resetButton', 'eraser', 'black', 'blue', 'red', 'undoButton', 'redoButton', 'time', 'goStop', 'forward', 'backward', 'readout', 'backstop', 'resizerPane', 'addBitmapButton', 'addBitmapChoice'].forEach((n) => {
      this.elements[n] = (n === 'body') ? document.querySelector('#' + n) : this.content.querySelector('#' +  n);
    });

    this.handlerMap = [
      ['body', 'keypress', 'keyboard'],
      ['body', 'keydown', 'keyboard'],
      ['body', 'input', 'keyboard'],
      ['canvas', 'mousedown', 'mousedown'],
      ['canvas', 'mousemove', 'mousemove'],
      ['canvas', 'mouseup', 'mouseup'],
      ['canvas', 'drop', 'drop'],
      ['canvas', 'dragenter', 'drag'],
      ['canvas', 'dragover', 'drag'],
      ['canvas', 'dragleave', 'drag'],
      ['clearButton', 'click', 'clearHandler'],
      ['resetButton', 'click', 'resetHandler'],
      ['black', 'click', 'colorHandler'],
      ['blue', 'click', 'colorHandler'],
      ['red', 'click', 'colorHandler'],
      ['eraser', 'click', 'colorHandler'],
      ['time', 'change', 'timeHandler'],
      ['time', 'input', 'timeHandler'],
      ['goStop', 'click', 'goStopHandler'],
      ['backward', 'click', 'backwardHandler'],
      ['forward', 'click', 'forwardHandler'],
      ['undoButton', 'click', 'undoHandler'],
      ['redoButton', 'click', 'redoHandler'],
      // ['addBitmapButton', 'click', 'addBitmapHandler'],
      // ['addBitmapChoice', 'change', 'addBitmapSelectedHandler'],
    ];

    this.handlerMap.forEach((triple) => {
      this.elements[triple[0]].addEventListener(triple[1], this.handlers[triple[2]]);
    });

    this.canvas = this.elements.canvas;
    this.elements.time.valueAsNumber = 0;

    this.elements.undoButton.classList.add('disabled');
    this.elements.redoButton.classList.add('disabled');

    this.assetManager = new AssetManager();

    for (let k in this.model.assets) {
      this.actuallyLoadImage(k, this.model.assets[k]);
    }

    if (this.model.videoAsset) {
      this.actuallyLoadVideo(this.model.videoAsset);
    }

    if (this.model.isPlaying) {console.log("it is already playing");}
  }

  synced(value) {
    this.isSynced = value;
    console.log('synced', this.isSynced);
    if (!this.isSynced) {return;}
    if (this.maybeVideo) {
      let video = this.maybeVideo;
      this.maybeVideo = null;
      this.loadVideo(video);
    }
  }

  detach() {
    super.detach();
    this.detatched = true;
    this.handlerMap.forEach((triple) => {
      this.elements[triple[0]].removeEventListener(triple[1], this.handlers[triple[2]]);
    });

    this.reset({});
    this.isSynced = false;
  }

  dropEvent(evt) {
    evt.preventDefault();
    return {dataTransfer: evt.dataTransfer, origEvent: evt, clientX: evt.clientX, clientY: evt.clientY};
  }

  cookEvent(evt) {
    if (evt.key === undefined) {
      return {touches: evt.touches, screenX: evt.screenX, screenY: evt.screenY,
              offsetX: evt.offsetX, offsetY: evt.offsetY, shiftKey: evt.shiftKey, origEvent: evt};
    }
    return {key: evt.key, metaKey: evt.metaKey, altKey: evt.altKey, ctrlKey: evt.ctrlKey, shiftKey: evt.shiftKey, origEvent: evt};
  }

  async dispatch(arg) {
    if (arg === undefined) {return;}
    let mth = this.messages[arg.message];
    if (!mth || !this[mth]) {return;}
    let value = this[mth](arg);
    if (value === undefined) {return;}
    ((typeof value === "object" && value.constructor === Promise) ? value : Promise.resolve(value)).then((v) => {
      if (isLocal) {
        session.model.dispatch(v);
      } else {
        this.publish(this.modelId, "message", v);
      }
    });
  }

  mouseDown(evt) {
    this.lastPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY, shiftKey: evt.shiftKey};

    let {x, y, shiftKey, userId} = this.lastPoint;
    let mySelection = this.model.selections[userId];
    let newClick = this.model.objects.liveObjects(this.videoTime).find(obj => {
      return obj.includesPoint(this.model.time, x, y); // && not selected by others
    });

    if (mySelection) {
      if (newClick) {
        if (mySelection === newClick) {
          if (shiftKey) {
            return {message: 'unselect', userId, time: this.videoTime};
          } else {
            let info = newClick.getRect(this.model.time);
            let transform = info.transform;
            this.moveSelection = {objectId: newClick.id, ...info};
            this.movePoint = {origX: transform[2], origY: transform[5], x, y};
          }
        } else { // mySelection !== newClick
          if (shiftKey) {
            // would be multi select
            return {message: 'unselect', userId, time: this.videoTime};
          } else {
            return {message: 'unselect', userId, time: this.videoTime};
          }
        }
      } else {
        return {message: 'unselect', userId, time: this.videoTime};
      }
    } else {
      if (shiftKey) {
        if (newClick) {
          let info = newClick.getRect(this.model.time);
          let transform = info.transform;
          this.moveSelection = {objectId: newClick.id, ...info};
          this.movePoint = {origX: transform[2], origY: transform[5], x, y};
          return {message: 'select', userId, objectId: newClick.id, time: this.videoTime};
        } else {
          return undefined;
        }
      } else {
        this.strokeId = newId();
        return {message: 'beginStroke', color: this.color, objectId: this.strokeId, time: this.videoTime};
      }
    }
  }

  mouseMove(evt) {
    if (!this.lastPoint) {return undefined;}
    let userId = this.viewId;
    
    let newPoint = {userId, x: evt.offsetX, y: evt.offsetY};
    if (this.strokeId) {
      if (this.lastPoint.x === newPoint.x && this.lastPoint.y === newPoint.y) {return undefined;}
      let color = this.color;
      let stroke = {
        message: 'stroke',
        x0: this.lastPoint.x, y0: this.lastPoint.y,
        x1: newPoint.x, y1: newPoint.y, color,
        time: this.videoTime
      };
      if (VIEW_EARLY_DRAW) {
        new Interface(this.model.bitmaps).newSegment(this.canvas, stroke, [1, 0, 0, 0, 1, 0]);
      }
      this.lastPoint = newPoint;
      return Object.assign({userId, objectId: this.strokeId}, stroke);
    } else if (this.moveSelection) {
      let {transform, objectId} = this.moveSelection; // width and height?

      let firstReframe = this.movePoint.newX === undefined;

      this.movePoint.newX = this.movePoint.origX + (newPoint.x - this.movePoint.x);
      this.movePoint.newY = this.movePoint.origY + (newPoint.y - this.movePoint.y);

      let newTransform = transform.slice();
      newTransform[2] = this.movePoint.newX;
      newTransform[5] = this.movePoint.newY;
      
      return {
        message: 'reframe',
        firstReframe,
        transform: newTransform,
        objectId, userId,
        time: this.videoTime};
    }
    return undefined;
  }

  mouseUp(evt) {
    let strokeId = this.strokeId;
    let moveSelection = this.moveSelection;
    let movePoint = this.movePoint;
    this.lastPoint = null;
    this.moveSelection = null;
    this.movePoint = null;
    this.strokeId = null;
    if (strokeId) {
      return {message: 'finishStroke', userId: this.viewId, objectId: strokeId, x: evt.offsetX, y: evt.offsetY, time: this.videoTime};
    } else if (moveSelection && movePoint) {
      if (movePoint.newX !== undefined) {
        return {message: 'finishReframe', ...moveSelection, time: this.videoTime};
      }
    }
  }

  keyboard(evt) {
    if (evt.key === "Backspace" || evt.key === "Delete") {
      evt.origEvent.preventDefault();
      return {message: "delete", userId: this.viewId, time: this.videoTime};
    }

    if (evt.key === 'z' && (evt.metaKey || evt.ctrlKey)) {
      evt.origEvent.preventDefault();
      return {message: "undo", userId: this.viewId, time: this.videoTime};
    }
    if (evt.key === 'y' && (evt.metaKey || evt.ctrlKey)) {
      evt.origEvent.preventDefault();
      return {message: "redo", userId: this.viewId, time: this.videoTime};
    }
  }

  drag(evt) {
    evt.preventDefault();
  }

  drop(evt) {
    let isFileDrop = (evt) => {
      const dt = evt.dataTransfer;
      for (let i = 0; i < dt.types.length; i++) {
        if (dt.types[i] === "Files") {
          return true;
        }
      }
      return false;
    };

    const cRect = this.canvas.getBoundingClientRect();
    const dropPoint = { x: evt.clientX - cRect.left, y: evt.clientY - cRect.top };
    if (isFileDrop(evt)) {
      this.assetManager.handleFileDrop(evt.dataTransfer.items, this.model, this, dropPoint);
    } else {
      console.log("unknown drop type");
    }
  }

  reset(info) {
    this.maybeVideo = null;
    
    if (this.elements.backstop.firstChild) {
      this.elements.backstop.firstChild.remove();
    }
    this.color = 'black';
    if (this.videoView) {
      this.videoView.dispose();
    }
    this.videoView = null;
    this.videoTime = 0;

    for (let k in bitmaps) {
      URL.revokeObjectURL(bitmaps[k].url);
      delete bitmaps[k];
    }

    let {width, height} = info;
    width = width || 500;
    height = height || 500;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.setProperty('width', width + 'px');
    this.canvas.style.setProperty('height', height + 'px');
    this.elements.time.max = length || 20;

    this.elements.backstop.style.setProperty("width", width + "px");
    this.elements.backstop.style.setProperty("height", height + "px");
    this.updateScreen({});
  }

  async addAsset(info) {
    console.log('addAsset', info);
    let type = info.assetDescriptor.loadType;
    let objectId = newId();
    let userId = this.viewId;
    let assetManager = this.assetManager;
    let assetDescriptor = info.assetDescriptor;

    if (type === 'image') {
      let objURL = await this.assetManager.importImage(assetDescriptor);
      let img;
      await new Promise((resolve, reject) => {
        img = document.createElement('img');
        img.src = objURL;
        img.onload = resolve;
      });

      return {
        message: 'addImage', assetDescriptor, objectId, userId, 
        width: img.width, height: img.height,
        time: this.videoTime
      };
    }

    if (type === 'video') {
      let okToGo = true; // unless cancelled by another load, or a shutdown
      let obj = await assetManager.ensureAssetsAvailable(assetDescriptor)
        .then(() => assetManager.importVideo(assetDescriptor, false)) // false => not 3D
        .then(objectURL => new VideoInterface(objectURL).readyPromise)
        .then(videoView => {
          if (!okToGo) {return;} // been cancelled
          return videoView;
        });

      if (obj) {
        return {
          message: 'addVideo', assetDescriptor, objectId, userId, 
          width: obj.width(), height: obj.height(), duration: obj.duration,
          time: this.videoTime
        };
      }
    }
    return undefined;
  }

  loadImage(info) {
    this.actuallyLoadImage(info.objectId, info.assetDescriptor);
  }

  async actuallyLoadImage(objectId, assetDescriptor) {
    let objURL = await this.assetManager.importImage(assetDescriptor);
    let img = document.createElement('img');
    img.src = objURL;
    img.onload = () => this.updateScreen({});
    bitmaps[objectId] = img;
  }

  loadVideo(info) {
    if (!isLocal && !this.isSynced) {
      console.log('not synced', info, this.videoView);
      this.maybeVideo = info;
      return;
    }

    if (this.maybeVideo) {
      console.log('maybeVideo');
      return;
    }
    
    this.reset({width: info.width, height: info.height, duration: info.duration});
    this.actuallyLoadVideo(info.assetDescriptor);
  }

  async actuallyLoadVideo(assetDescriptor) {
    let assetManager = this.assetManager;
    let okToGo = true; // unless cancelled by another load, or a shutdown
    //this.waitingForSync = !this.realm.isSynced; // this can flip back and forth
    this.abandonLoad = () => okToGo = false;

    this.playStateChanged({ isPlaying: this.model.isPlaying,
                            startTime: this.model.startTime,
                            pausedTime: this.model.pausedTime });
    // will be stored for now, and may be overridden by messages in a backlog by the time the video is ready

    await assetManager.ensureAssetsAvailable(assetDescriptor)
      .then(() => assetManager.importVideo(assetDescriptor, false)) // false => not 3D
      .then(objectURL => new VideoInterface(objectURL).readyPromise)
      .then(videoView => {
        if (!okToGo) {return;} // been cancelled
        delete this.abandonLoad;

        this.videoView = videoView;
        this.playbackBoost = 0;
        this.elements.backstop.appendChild(videoView.video);

        this.applyPlayState();
        this.lastTimingCheck = this.now() + 500; // let it settle before we try to adjust
        this.elements.time.max = this.videoView.duration.toString();
        
      })
      .catch(err => console.error(err));
    return {message: 'loadVideo', time: this.videoTime}
  }

  playStateChanged(rawData) {
    const data = { ...rawData }; // take a copy that we can play with
    this.latestActionSpec = data.actionSpec; // if any
    delete data.actionSpec;

    const latest = this.latestPlayState;
    // ignore if we've heard this one before (probably because we set it locally)
    if (latest && Object.keys(data).every(key => data[key] === latest[key])) {return;}

    this.latestPlayState = data;
    this.applyPlayState(); // will be ignored if we're still initialising
  }

  applyPlayState() {
    if (!this.videoView) {return;}

    let videoView = this.videoView;
    let videoElem = videoView.video;

    let now = this.now();

    console.log("apply playState", {...this.latestPlayState});
    if (!this.latestPlayState.isPlaying) {
      videoView.pause(this.latestPlayState.pausedTime);
    } else {
      videoElem.playbackRate = 1 + this.playbackBoost * 0.01;
      this.lastRateAdjust = now; // make sure we don't adjust rate until playback has settled in, and after any emergency jump we decide to do
      this.jumpIfNeeded = false;
      // if the video is blocked from playing, enter a stepping mode in which we move the video forward with successive pause() calls
      videoView.play(videoView.calculateVideoTime(now, this.model.startTime) + 0.1).then(playStarted => {
        if (playStarted) {
          // leave it a little time to stabilise          
          this.future(250).triggerJumpCheck();
        } else if (!videoElem.muted) {
          console.log(`trying with mute`);
          videoElem.muted = true;
          this.applyPlayState();
        } else {
          console.log(`reverting to stepped display`);
          this.isStepping = true;
          this.stepWhileBlocked();
        }
      });
    }
    if (this.latestActionSpec) {this.revealAction(this.latestActionSpec);}
  }

  triggerJumpCheck() {
    // on next checkPlayStatus() that does a timing check
    this.jumpIfNeeded = true;
  }

  drawFrames(intf) {
    for (let k in this.resizers) {
      for (let j in this.resizers[k]) {
        this.resizers[k][j].style.setProperty("display", "none");
      }
    }
    
    for (let k in this.model.selections) {
      let obj = this.model.selections[k];
      if (!obj) {continue;}
      let info = obj.getRect(this.model.time);
      intf.drawFrame(this.canvas, info);

      let resizers = this.ensureResizersFor(this.viewId);
      intf.set4Handles(info, resizers);
    }
  }

  ensureResizersFor(userId) {
    if (!this.resizers[userId]) {
      let coords = [
        {name: 'topLeft', x: 0, y: 0},
        {name: 'topRight', x: 1, y: 0},
        {name: 'bottomRight', x: 1, y: 1},
        {name: 'bottomLeft', x: 0, y: 1}
      ];

      let resizers = {};

      let data = {};

      let callback = (info) => {
        if (info.message === "down") {
          data.left = info.left;
          data.top = info.top;
          data.screenX = info.screenX;
          data.screenY = info.screenY;
          data.corner = info.target.id;
          let obj = this.model.selections[userId];
          let rect = obj.getRect(this.model.time);
          data.origRect = rect;
          data.objectId = obj.id;
        } else if (info.message === "move") {
          this.resize(info, userId, data);
        }
      };

      coords.forEach((coord) => {
        let div = document.createElement('div');
        div.classList.add('resizer');
        div.id = coord.name;
        div.coord = coord;
        resizers[div.id] = div;
        this.elements.resizerPane.appendChild(div);
        div.addEventListener("mousedown", dragger(callback, coord.name));
      });

      this.resizers[userId] = resizers;
    }
    return this.resizers[userId];
  }

  cornerReframe(info) {
    return Object.assign({}, info, {message: 'reframe', time: this.videoTime});
  }

  resize(info, userId, data) {
    if (data.corner === 'bottomRight') {
      let oldTransform = data.origRect.transform;

      let sx = (data.origRect.width + ((info.screenX - data.screenX) / oldTransform[0])) / data.origRect.width;
      let sy = (data.origRect.height + ((info.screenY - data.screenY) / oldTransform[4])) / data.origRect.height;

      let transform = [sx, 0, 0, 0, sy, 0];

      let ox = data.origRect.ox || 0;
      let oy = data.origRect.oy || 0;

      let newTransform = Transform.compose(oldTransform, transform);

      newTransform[2] = 0;
      newTransform[5] = 0;

      let op = Transform.transformPoint(oldTransform, ox, oy);
      let tp = Transform.transformPoint(newTransform, ox, oy);

      newTransform[2] = - tp.x + op.x;
      newTransform[5] = - tp.y + op.y;

      this.dispatch({message: 'cornerReframe',
                     firstReframe: false,
                     transform: newTransform,
                     objectId: data.objectId, userId, time: this.videoTime});
    }
  }

  stroke(info) {
    if (VIEW_EARLY_DRAW && info.userId === this.viewId) {return;}
    this.updateScreen({dontUpdateButtons: true});
  }

  finishStroke(info) {
    this.updateButtons();
  }

  goStopPressed(info) {
    let now = this.now();
    let newPlaying = !this.model.isPlaying;
    return {message: 'setPlayState', isPlaying: newPlaying, startTime: (now / 1000) - this.videoTime, time: this.videoTime};
  }

  backwardPressed(info) {
    let videoTime = Math.max(this.videoTime - 0.1, 0);
    let now = this.now() / 1000;
    return {message: 'setPlayState', startTime: now - videoTime, time: now};
  }
    
  forwardPressed(info) {
    let duration = this.videoView ? this.videoView.duration : 20;
    let videoTime = Math.min(this.videoTime + 0.1, duration);
    let now = this.now() / 1000;
    return {message: 'setPlayState', startTime: now - videoTime, time: now};
  }

  setColor(name) {
    this.color = name === 'eraser' ? 'erase' : name;
  }

  clearPressed(arg) {
    return {message: 'clear', time: this.videoTime};
  }

  resetPressed(arg) {
    return {message: 'reset', time: this.videoTime};
  }

  undoPressed(arg) {
    return {message: 'undo', time: this.videoTime};
  }

  redoPressed(arg) {
    return {message: 'redo', time: this.videoTime};
  }

  addBitmapPressed(evt) {
    this.elements.addBitmapChoice.style.setProperty("display", "inherit");
  }

  async addBitmapSelected(evt) {
    this.elements.addBitmapChoice.style.setProperty("display", "none");

    let name = evt.target.value;
    // await getBitmaps();
    let bits = bitmaps[name];
    if (bits) {
      let id = newId();
      return {message: 'addBitmap', name: name, x: 100, y: 100, width: bits.width, height: bits.height, objectId: id, userId: this.viewId, time: this.videoTime};
    }
    return undefined;
  }

  finishReframe(info) {
    this.updateButtons();
  }

  timeChanged(info) {
    let videoTime = info.time;
    let now = this.now() / 1000;
    return {message: 'setPlayState', startTime: now - videoTime, time: now};
  }

  updateScreen(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.videoTime, intf);
    this.drawFrames(intf);
    if (!info.dontUpdateButtons) {
      this.elements.goStop.textContent = this.model.isPlaying ? "Stop" : "Go";
      this.elements.time.valueAsNumber = this.videoTime;
      this.elements.readout.textContent = this.videoTime.toFixed(2);
      this.updateButtons();
    }
  }

  updateButtons() {
    if (this.model.history.length > 0) {
      this.elements.undoButton.classList.remove('disabled');
    } else {
      this.elements.undoButton.classList.add('disabled');
    }
    
    if (this.model.redoHistory.length > 0) {
      this.elements.redoButton.classList.remove('disabled');
    } else {
      this.elements.redoButton.classList.add('disabled');
    }
  }

  checkPlayStatus(now) {
    let lastStatusCheck = this.lastStatusCheck || 0;
    if (now - this.lastStatusCheck <= 100) {return;}
    this.lastStatusCheck = now;
    
    let lastTimingCheck = this.lastTimingCheck || 0;
    if (!this.videoView.isPlaying || this.videoView.isBlocked
        || (now - lastTimingCheck <= 500)) {
      return;
    }
    this.lastTimingCheck = now;
    
    let expectedTime = this.videoView.wrappedTime(this.videoView.calculateVideoTime(now, this.model.startTime), true);
    const videoTime = this.videoView.video.currentTime;
    const videoDiff = videoTime - expectedTime;
    const videoDiffMS = videoDiff * 1000; // +ve means *ahead* of where it should be
    // otherwise presumably measured across a loop restart; just ignore.
    if (videoDiff > this.videoView.duration / 2) {return;}

    if (this.jumpIfNeeded) {
      this.jumpIfNeeded = false;
      // if there's a difference greater than 500ms, try to jump the video to the right place
      if (Math.abs(videoDiffMS) > 500) {
        console.log(`jumping video by ${-Math.round(videoDiffMS)}ms`);
        this.videoView.video.currentTime = this.videoView.wrappedTime(videoTime - videoDiff + 0.1, true, this.videoView.duration); // 0.1 to counteract the delay that the jump itself tends to introduce; true to ensure we're not jumping beyond the last video frame
      }
    } else {
      // every 3s, check video lag/advance, and set the playback rate accordingly.
      // current adjustment settings:
      //   > 150ms off: set playback 3% faster/slower than normal
      //   > 50ms: 1% faster/slower
      //   < 25ms: normal (i.e., hysteresis between 50ms and 25ms in the same sense)
      let lastRateAdjust = this.lastRateAdjust || 0;
      if (now - lastRateAdjust <= 3000) {return;}
      this.lastRateAdjust = now;
      
      let oldBoostPercent = this.playbackBoost;
      let diffAbs = Math.abs(videoDiffMS), diffSign = Math.sign(videoDiffMS);
      let desiredBoostPercent = -diffSign * (diffAbs > 150 ? 3 : (diffAbs > 50 ? 1 : 0));
      if (desiredBoostPercent !== oldBoostPercent) {
        // apply hysteresis on the switch to boost=0.
        // for example, if old boost was +ve (because video was lagging),
        // and videoDiff is -ve (i.e., it's still lagging),
        // and the magnitude (of the lag) is greater than 25ms,
        // don't remove the boost yet.
        const hysteresisBlock = desiredBoostPercent === 0 && Math.sign(oldBoostPercent) === -diffSign && diffAbs >= 25;
        if (!hysteresisBlock) {
          this.playbackBoost = desiredBoostPercent;
          let playbackRate = 1 + this.playbackBoost * 0.01;
          console.log(`video playback rate: ${playbackRate}`);
          this.videoView.video.playbackRate = playbackRate;
        }
      }
    }
  }

  setPlayState(info) {
    if (info.time !== undefined && info.startTime !== undefined) {
      let now = this.now();
      let time = (now / 1000) - info.startTime;
      this.videoTime = time;
      if (this.videoView) {
        this.videoView.video.currentTime = time;
        if (this.model.isPlaying) {
          this.videoView.play(this.videoTime);
        } else {
          this.videoView.pause(this.videoTime);
        }
      }
    }
    this.updateScreen({});
  }

  atEnd(info) {
    return Object.assign({}, info, {message: 'setPlayState'});
  }

  update() {
    let now = this.now();
    if (this.videoView) {
      this.checkPlayStatus(now);
      this.videoTime = this.videoView.video.currentTime;
      this.updateScreen({});
    } else {
      if (this.model.isPlaying) {
        this.videoTime = (now / 1000) - this.model.startTime;
        if (this.videoTime > 20) {
          this.videoTime = 20;
          this.dispatch({message: 'atEnd', isPlaying: false, pauseTime: this.videoTime});
          return;
        }
        this.updateScreen({});
      }
    }
  }
}

// VideoInterface is an interface over an HTML video element.
// its readyPromise resolves once the video is available to play.
class VideoInterface {
  constructor(url) {
    this.url = url;
    this.video = document.createElement("video");
    this.video.autoplay = false;
    this.video.loop = true;
    this.isPlaying = false;
    this.isBlocked = false; // unless we find out to the contrary, on trying to play

    this.readyPromise = new Promise(resolve => {
      this._ready = () => resolve(this);
    });

    this.video.oncanplay = () => {
      if (this.video) {
        this.duration = this.video.duration; // ondurationchange is (apparently) always ahead of oncanplay
      }
      this._ready();
    };

    this.video.onerror = () => {
      let err;
      const errCode = this.video.error.code;
      switch (errCode) {
        case 1: err = "video loading aborted"; break;
        case 2: err = "network loading error"; break;
        case 3: err = "video decoding failed / corrupted data or unsupported codec"; break;
        case 4: err = "video not supported"; break;
        default: err = "unknown video error";
      }
      console.log(`Error: ${err} (errorcode=${errCode})`);
    };

    /* other events, that can help with debugging
       [ "pause", "play", "seeking", "seeked", "stalled", "waiting" ].forEach(k => { this.video[`on${k}`] = () => console.log(k); });
    */

    this.video.crossOrigin = "anonymous";

    if (!this.video.canPlayType("video/mp4").match(/maybe|probably/i)) {
      console.log("apparently can't play video");
    }

    this.video.src = this.url;
    this.video.load();
  }

  width() { return this.video.videoWidth; }
  height() { return this.video.videoHeight; }

  wrappedTime(videoTime, guarded) {
    if (this.duration) {
      while (videoTime > this.duration) {
        videoTime -= this.duration;
        // assume it's looping, with no gap between plays
      }
      if (guarded) {
        videoTime = Math.min(this.duration - 0.1, videoTime);
        // the video element freaks out on being told to seek very close to the end
      }
    }
    return videoTime;
  }

  calculateVideoTime(now, startTime) {
    return now / 1000 - startTime;
  }

  async play(videoTime) {
    // return true if video play started successfully
    let t = this.wrappedTime(videoTime, true);
    console.log('play', t);
    this.video.currentTime = t;
    this.isPlaying = true; // even if it turns out to be blocked by the browser
    // following guidelines from https://developer.mozilla.org/docs/Web/API/HTMLMediaElement/play
    try {
      await this.video.play(); // will throw exception if blocked
      this.isBlocked = false;
    } catch (err) {
      console.warn("video play blocked");
      this.isBlocked = this.isPlaying; // just in case isPlaying was set false while we were trying
    }
    return !this.isBlocked;
  }

  pause(videoTime) {
    this.isPlaying = this.isBlocked = false; // might not be blocked next time.
    this.setStatic(videoTime);
  }

  setStatic(videoTime) {
    if (videoTime !== undefined) {
      this.video.currentTime = this.wrappedTime(videoTime, true);
      // true => guarded from values too near the end
    }
    this.video.pause(); // no return value; synchronous, instantaneous?
  }

  dispose() {
    try {
      URL.revokeObjectURL(this.url);
      if (this.video) {
        delete this.video.oncanplay;
        delete this.video;
      }
    } catch (e) { console.warn(`error in Video2DView cleanup: ${e}`); }
  }
}


async function start() {
  if (isLocal) {
    session = makeMockReflector(DrawingModel, DrawingView);
    return Promise.resolve('local');
  } else {
    // Croquet.App.makeWidgetDock();
    session = await Croquet.startSession("Drawing", DrawingModel, DrawingView, {tps: "10x3"});
    return Promise.resolve('remote');
  }
}

start();
