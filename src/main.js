/* global YT */

import * as Croquet from '@croquet/croquet';

import {load} from './bitmap.js';
import {Objects, Stroke, Bitmap, Action, Transform, newId} from './timeObject.js';
import {dragger} from './dragger.js';

let isLocal = true;
let session;

let bitmaps;
async function getBitmaps() {
  if (!bitmaps) {
    bitmaps = await load();
  }
  return bitmaps;
}

const VIEW_EARLY_DRAW = true;

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
}

class MockView {
  constructor(model) {
    this.id = 'def';
    this.viewId = this.id;
  }
  subscribe() {}
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

    ctx.strokeStyle = color;
    
    ctx.lineWidth = color === 'white' ? 6 : 2;

    ctx.save();
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
          let {id, transform, keys, data} = c;
          return {id, transform, keys, data};
        },
        read: (obj) => {
          let b = new Bitmap(obj.id);
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

  init() {
    this.objects = new Objects(newId());

    this.now = 0;
    this.playing = false;
    this.canvasExtent = {width: 500, height: 500};

    this.history = [];
    this.redoHistory = [];
    this.selections = {};

    this.messages = {
      'beginStroke': 'beginStroke',
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'addBitmap': 'addBitmap',
      'reframe': 'reframe',
      'finishReframe': 'finishReframe',
      'clear': 'clear',
      'delete': 'delete',
      'undo': 'undo',
      'redo': 'redo',
      'select': 'select',
      'unselect': 'unselect',
      // ---
      'load': 'load',
      'clock': 'clock',
      'seek': 'seek',
      'toggleGoStop': 'toggleGoStop',
      'configure': 'configure',
    };

    this.subscribe(this.sessionId, "view-join", this.viewJoin);
    this.subscribe(this.sessionId, "view-exit", this.viewExit);

    this.subscribe(this.id, "message", this.dispatch);
    this.future(50).tick();
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
    getBitmaps();
  }

  viewExit(viewId) {}

  beginStroke(info) {
    this.removeSelection(info.userId);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  stroke(info) {
    let obj = this.objects.get(this.now, info.objectId);

    if (!obj) {
      obj = new Stroke(info.objectId);
      obj.addTransform(this.now, {message: 'new', transform: [1, 0, 0, 0, 1, 0]});
      this.objects.addObject(this.now, obj);
      this.history.push(new Action('addObject', obj));
    }
    
    obj.add(this.now, info);
    return info;
  }

  finishStroke(info) {
    return info;
  }

  addBitmap(info) {
    this.removeSelection(info.userId);
    let obj = new Bitmap(info.objectId, info.name, info.width, info.height);
    obj.addTransform(this.now, {message: 'new', transform: [1, 0, info.x, 0, 1, info.y]});
    this.objects.addObject(this.now, obj);
    this.history.push(new Action('addObject', obj));
    return {message: 'updateScreen'};
  }

  reframe(info) {
    let obj = this.objects.get(this.now, info.objectId);
    if (!obj) {return;} // it is possible that another client just has cleared this object

    obj.reframe(this.now, info);
    return {message: 'updateScreen', dontUpdateButtons: true};
  }

  finishReframe(info) {
    let obj = this.objects.get(this.now, info.objectId);
    if (!obj) {return;}

    let action = obj.finishReframe(this.now, info);
    this.history.push(action);

    return info;
  }

  select(info) {
    let obj = this.objects.get(this.now, info.objectId);
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
    let undo = this.objects.killObjects(this.now);
    this.history.push(new Action('clear', undo));
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  delete(info) {
    let obj = this.selections[info.userId];
    if (!obj) {return undefined;}

    let undo = this.objects.killObject(this.now, obj.id);
    this.history.push(new Action('clear', undo));
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  undo(info) {
    if (this.history.length === 0) {return undefined;}
    let action = this.history.pop();
    this.redoHistory.push(action);
    action.undo(this);
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  redo(info) {
    if (this.redoHistory.length === 0) {return undefined;}
    let action = this.redoHistory.pop();
    action.redo(this);
    this.history.push(action);
    this.removeSelection();
    return {message: 'updateScreen'};
  }

  clock(info) {
    if (this.now !== info.time) {
      this.now = info.time;
      return info;
    }
    return undefined;
  }

  seek(info) {
    if (this.player) {
      this.player.seekTo(info.time);
    } else {
      return this.clock({message: 'clock', time: info.time});
    }
  }

  toggleGoStop(info) {
    this.playing = !this.playing;
    if (!this.player) {return info;}

    if (this.playing) {
      this.player.playVideo();
    } else {
      this.player.pauseVideo();
    }
    return info;
  }

  load(info) {
    let movieId = info.movieId;

    /* YouTube Javascript API stuff */
    let tag = document.createElement('script');
    tag.src = 'http://www.youtube.com/iframe_api';
    let firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    let firstTime = true;

    window.onYouTubeIframeAPIReady = () => {
      this.player = new YT.Player('player', {
        height: '576',
        width:  '1024',
        videoId: movieId,
        events: {
          'onStateChange': onPlayerStateChange,
          'onReady': onPlayerReady,
        },
        playerVars: {rel: 0, showinfo: 0},
      });
    };

    let callback = () => {
      if (!this.player) {return;}
      this.now = parseFloat(this.player.getCurrentTime());
      this.dispatch({message: 'clock', time: this.now});
    };

    let onPlayerReady = () => {
      console.log("player ready");
      this.dispatch({message: "configure", width: 1024, height: 576, length: this.player.getDuration()});
    };

    let onPlayerStateChange = (e) => {
      if (e.data === YT.PlayerState.PLAYING) {
        this.interval = window.setInterval(callback, 100); // update every 1/10th second
      }
      if (e.data === YT.PlayerState.ENDED  ||
          e.data === YT.PlayerState.PAUSED ||
          e.data === YT.PlayerState.BUFFERING) {
        window.clearInterval(this.interval);
      }
    };

    return {message: 'load', width: 1024, height: 576};
  }

  configure(info) {
    let {width, height} = info;
    this.canvasExtent = {width, height};

    //cache.resetFor(modelCanvas);
    this.objects = new Objects(newId());
    return info;
  }

  tick() {
    this.future(50).tick();
    if (!this.playing) {
      return;
    }

    let newTime = this.now + 0.05;
    if (newTime >= 20) {
      newTime = 20;
      this.playing = false;
    }
    this.dispatch({message: 'clock', time: newTime});
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

    this.resizers = {};

    this.messages = {
      'mouseDown': 'mouseDown',
      'mouseMove': 'mouseMove',
      'mouseUp': 'mouseUp',
      'keyboard': 'keyboard',
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'clearPressed': 'clearPressed',
      'goStopPressed': 'goStopPressed',
      'loadPressed': 'loadPressed',
      'timeChanged': 'timeChanged',
      'undoPressed': 'undoPressed',
      'redoPressed': 'redoPressed',
      'addBitmapPressed': 'addBitmapPressed',
      'addBitmapSelected': 'addBitmapSelected',
      'cornerReframe': 'cornerReframe',
      'clock': 'clock',
      'updateScreen': 'updateScreen',
      'finishReframe': 'finishReframe',
      'toggleGoStop': 'toggleGoStop',
      'load': 'load',
      'configure': 'configure',
    };

    this.subscribe(this.modelId, "message-m", this.dispatch);

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
      clearHandler: (evt) => this.dispatch({message: 'clearPressed'}),
      colorHandler: (evt) => this.setColor(evt.target.id),
      timeHandler: (evt) => this.dispatch(
        {message: 'timeChanged', time: this.elements.time.valueAsNumber}),
      goStopHandler: (evt) => this.dispatch({message: 'goStopPressed'}),
      loadHandler: (evt) => this.dispatch({message: 'loadPressed'}),
      undoHandler: (evt) => this.dispatch({message: 'undoPressed'}),
      redoHandler: (evt) => this.dispatch({message: 'redoPressed'}),
      addBitmapHandler: (evt) => this.addBitmapPressed(),
      addBitmapSelectedHandler: (evt) => this.dispatch({message: 'addBitmapSelected', target: evt.target})
    };

    this.elements = {};
    ['body', 'canvas', 'loadButton', 'movieId', 'clearButton','eraser', 'black', 'blue', 'red', 'undoButton', 'redoButton', 'time', 'goStop', 'readout', 'backstop', 'resizerPane', 'addBitmapButton', 'addBitmapChoice'].forEach((n) => {
      this.elements[n] = (n === 'body') ? document.querySelector('#' + n) : this.content.querySelector('#' +  n);
    });

    this.handlerMap = [
      ['body', 'keypress', 'keyboard'],
      ['body', 'keydown', 'keyboard'],
      ['body', 'input', 'keyboard'],
      ['canvas', 'mousedown', 'mousedown'],
      ['canvas', 'mousemove', 'mousemove'],
      ['canvas', 'mouseup', 'mouseup'],
      ['clearButton', 'click', 'clearHandler'],
      ['black', 'click', 'colorHandler'],
      ['blue', 'click', 'colorHandler'],
      ['red', 'click', 'colorHandler'],
      ['eraser', 'click', 'colorHandler'],
      ['time', 'change', 'timeHandler'],
      ['time', 'input', 'timeHandler'],
      ['goStop', 'click', 'goStopHandler'],
      ['undoButton', 'click', 'undoHandler'],
      ['redoButton', 'click', 'redoHandler'],
      ['loadButton', 'click', 'loadHandler'],
      ['addBitmapButton', 'click', 'addBitmapHandler'],
      ['addBitmapChoice', 'change', 'addBitmapSelectedHandler'],
    ];

    this.handlerMap.forEach((triple) => {
      this.elements[triple[0]].addEventListener(triple[1], this.handlers[triple[2]]);
    });

    this.canvas = this.elements.canvas;
    this.elements.time.valueAsNumber = 0;

    this.elements.undoButton.classList.add('disabled');
    this.elements.redoButton.classList.add('disabled');
  }

  detach() {
    this.handlerMap.forEach((triple) => {
      this.elements[triple[0]].removeEventListener(triple[1], this.handlers[triple[2]]);
    });
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
    let newClick = this.model.objects.liveObjects(this.model.now).find(obj => {
      return obj.includesPoint(this.model.now, x, y); // && not selected by others
    });

    if (mySelection) {
      if (newClick) {
        if (mySelection === newClick) {
          if (shiftKey) {
            return {message: 'unselect', userId};
          } else {
            let info = newClick.getRect(this.model.now);
            let transform = info.transform;
            this.moveSelection = {objectId: newClick.id, ...info};
            this.movePoint = {origX: transform[2], origY: transform[5], x, y};
          }
        } else { // mySelection !== newClick
          if (shiftKey) {
            // would be multi select
            return {message: 'unselect', userId};
          } else {
            return {message: 'unselect', userId};
          }
        }
      } else {
        return {message: 'unselect', userId};
      }
    } else {
      if (shiftKey) {
        if (newClick) {
          let info = newClick.getRect(this.model.now);
          let transform = info.transform;
          this.moveSelection = {objectId: newClick.id, ...info};
          this.movePoint = {origX: transform[2], origY: transform[5], x, y};
          return {message: 'select', userId, objectId: newClick.id};
        } else {
          return undefined;
        }
      } else {
        this.strokeId = newId();
        return {message: 'beginStroke', color: this.color, objectId: this.strokeId};
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
        x1: newPoint.x, y1: newPoint.y, color
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
      
      return {message: 'reframe',
              firstReframe,
              transform: newTransform,
              objectId, userId};
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
      return {message: 'finishStroke', userId: this.viewId, objectId: strokeId, x: evt.offsetX, y: evt.offsetY};
    } else if (moveSelection && movePoint) {
      if (movePoint.newX !== undefined) {
        return {message: 'finishReframe', ...moveSelection};
      }
    }
  }

  keyboard(evt) {
    if (evt.key === "Backspace" || evt.key === "Delete") {
      evt.origEvent.preventDefault();
      return {message: "delete", userId: this.viewId};
    }

    if (evt.key === 'z' && (evt.metaKey || evt.ctrlKey)) {
      evt.origEvent.preventDefault();
      return {message: "undo", userId: this.viewId};
    }
    if (evt.key === 'y' && (evt.metaKey || evt.ctrlKey)) {
      evt.origEvent.preventDefault();
      return {message: "redo", userId: this.viewId};
    }
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
      let info = obj.getRect(this.model.now);
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
          let rect = obj.getRect(this.model.now);
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
    return Object.assign({}, info, {message: 'reframe'});
  }

  transformPoint(t, x, y) {
    return {x: t[0] * x + t[1] * y + t[2], y: t[3] * x + t[4] * y + t[5]};
  }

  invertPoint(t, x, y) {
    let det = 1 / (t[0] * t[4] - t[1] * t[3]);

    let n = [det * t[4], det * -t[1], -t[2], det * -t[3], det * -t[0], -t[5]];

    return this.transformPoint(n, x, y);
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
                     objectId: data.objectId, userId});
    }
  }

  stroke(info) {
    if (VIEW_EARLY_DRAW && info.userId === this.viewId) {return;}
    this.screenUpdate({dontUpdateButtons: true});
  }

  finishStroke(info) {
    this.updateButtons();
  }

  goStopPressed(arg) {
    return {message: 'toggleGoStop'};
  }

  setColor(name) {
    this.color = name === 'eraser' ? 'white' : name;
  }

  loadPressed(arg) {
    return {message: 'load', movieId: this.movieId.textContent};
  }

  clearPressed(arg) {
    return {message: 'clear'};
  }

  undoPressed(arg) {
    return {message: 'undo'};
  }

  redoPressed(arg) {
    return {message: 'redo'};
  }

  addBitmapPressed(evt) {
    this.elements.addBitmapChoice.style.setProperty("display", "inherit");
  }

  async addBitmapSelected(evt) {
    this.elements.addBitmapChoice.style.setProperty("display", "none");

    let name = evt.target.value;
    await getBitmaps();
    let bits = bitmaps[name];
    if (bits) {
      let id = newId();
      return {message: 'addBitmap', name: name, x: 100, y: 100, width: bits.width, height: bits.height, objectId: id, userId: this.viewId};
    }
    return undefined;
  }

  finishReframe(info) {
    this.updateButtons();
  }

  timeChanged(arg) {
    return Object.assign(arg, {message: 'seek', time: arg.time});
  }

  clock(obj) {
    // this method is called only when the model got a new clock
    this.updateScreen({});
    
    this.elements.time.valueAsNumber = this.model.now;
    this.elements.readout.textContent = this.model.now.toFixed(2);
    this.toggleGoStop();
  }

  toggleGoStop() {
    this.elements.goStop.textContent = this.model.playing ? "Stop" : "Go";
  }

  configure(obj) {
    let {width, height, length} = obj;
    this.canvas.width = width;
    this.canvas.height = height;
    this.elements.time.max = length;

    this.elements.backstop.style.setProperty("width", width + "px");
    this.elements.backstop.style.setProperty("height", height + "px");
    this.elements.resizerHolder.style.setProperty("width", width + "px");
    this.elements.resizerHolder.style.setProperty("height", height + "px");

    this.cache.resetFor(this.canvas);
  }

  updateScreen(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
    if (!info.dontUpdateButtons) {
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

  update() {}
}

async function start() {
  if (isLocal) {
    session = makeMockReflector(DrawingModel, DrawingView);
    return Promise.resolve('local');
  } else {
    session = await Croquet.startSession("Drawing", DrawingModel, DrawingView, {tps: 1});
    return Promise.resolve('remote');
  }
}

start();
