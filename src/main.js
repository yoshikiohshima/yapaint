/* global YT */

import * as Croquet from '@croquet/croquet';

//import {Cache, Command, CommandArray, toKey, Bitmap} from './data.js';
import {load} from './bitmap.js';
import {Objects, Stroke, Bitmap, Action, Transform, newId} from './timeObject.js';

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
  newSegment(canvas, obj) {
    let {x0, y0, x1, y1, color} = obj;
    let ctx = canvas.getContext('2d');

    ctx.strokeStyle = color;
    
    ctx.lineWidth = color === 'white' ? 6 : 2;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  clear(canvas) {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  emptyImageData(width, height) {
    return new ImageData(width, height).data;
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
    let t = info.transform;
    let x = info.width;
    let y = info.height;
    let p = {x: t[0] * x + t[1] * y + t[2], y: t[3] * x + t[4] * y + t[5]};
    
    let ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#b1b1bf8c';
    ctx.beginPath();
    ctx.rect(t[2], t[5], p.x - t[2], p.y - t[5]);
    ctx.stroke();
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
      'removeBitmap': 'removeBitmap',
      'color': 'color',
      'clear': 'clear',
      'undo': 'undo',
      'redo': 'redo',
      'select': 'select',
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
    let obj = new Stroke(info.objectId);
    this.objects.addObject(this.now, obj);
    let action = new Action('addObject', obj);
    this.history.push(action);
    return info;
  }

  stroke(info) {
    let obj = this.objects.get(this.now, info.objectId);
    obj.add(this.now, info);
    return info;
  }

  finishStroke(info) {
    //this.history.push(new Action('finishStroke', info.objectId));
    return info;
  }

  addBitmap(info) {
    this.removeSelection(info.userId);
    let obj = new Bitmap(info.objectId, info.name, info.width, info.height);
    obj.addTransform(this.now, {message: 'new', transform: [1, 0, 100, 0, 1, 100]});
    this.objects.addObject(this.now, obj);
    this.history.push(new Action('addObject', obj));
    return info;
  }

  reframe(info) {
    let obj = this.objects.get(this.now, info.objectId);
    if (!obj) {return;} // it is possible that another client just has cleared this object

    let rect = obj.getRect(this.now);
    let t = rect.transform;
    if (info.firstReframe) {
      let moveId = newId();
      obj.add(this.now, {message: 'firstReframe', moveId, name: rect.name, width: rect.width, height: rect.height});
      obj.addTransform(this.now, {message: 'firstReframe', moveId, transform: rect.transform});
    } else {
      let newTransform = info.transform;
      obj.addTransform(this.now, {message: 'reframe', transform: newTransform});
    }
    return {message: 'reframe'};
  }

  finishReframe(info) {
    let obj = this.objects.get(this.now, info.objectId);
    if (!obj) {return;}
    let userId = info.userId;

    let last = obj.last(this.now);
    let transform = obj.transform.last(this.now).transform;

    obj.add(this.now, {message: 'finishReframe', name: last.name, width: last.width, height: last.height});

    this.history.push(new Action('finishReframe', {
      message: 'reframe', objectId: info.objectId, width: info.width, height: info.height, oldTransform: info.transform, newTransform: transform
    }));

    return info;
  }

  select(info) {
    let obj = this.objects.get(this.now, info.objectId);
    let userId = info.userId;
    if (!obj) {return;} // it is possible that another client just has cleared this object
    
    this.addSelection(userId, obj);
    return info;
  }

  clear(info) {
    let undo = this.objects.killObjects(this.now);
    this.history.push(new Action('clear', undo));
    this.removeSelection();
    return info;
  }

  undo(info) {
    if (this.history.length === 0) {return undefined;}
    let action = this.history.pop();
    this.redoHistory.push(action);
    action.undo(this);
    this.removeSelection();
    return info;
  }

  redo(info) {
    if (this.redoHistory.length === 0) {return undefined;}
    let action = this.redoHistory.pop();
    action.redo(this);
    this.history.push(action);
    this.removeSelection();
    return info;
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

    this.messages = {
      'mouseDown': 'mouseDown',
      'mouseMove': 'mouseMove',
      'mouseUp': 'mouseUp',
      'beginStroke': 'beginStroke',
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
      'clock': 'clock',
      'clear': 'clear',
      'undo': 'undo',
      'redo': 'redo',
      'addBitmap': 'addBitmap',
      'reframe': 'reframe',
      'finishReframe': 'finishReframe',
      'select': 'select',
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
    ['canvas', 'loadButton', 'movieId', 'clearButton','eraser', 'black', 'blue', 'red', 'undoButton', 'redoButton', 'time', 'goStop', 'readout', 'backstop', 'addBitmapButton', 'addBitmapChoice'].forEach((n) => this.elements[n] = this.content.querySelector('#' +  n));

    this.handlerMap = [
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
    return {touches: evt.touches, screenX: evt.screenX, screenY: evt.screenY,
            offsetX: evt.offsetX, offsetY: evt.offsetY, shiftKey: evt.shiftKey};
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
        new Interface(this.model.bitmaps).newSegment(this.canvas, stroke);
      }
      this.lastPoint = newPoint;
      return Object.assign({userId, objectId: this.strokeId}, stroke);
    } else if (this.moveSelection) {
      let {width, height, transform, objectId} = this.moveSelection;

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

  drawFrames(intf) {
    for (let k in this.model.selections) {
      let obj = this.model.selections[k];
      let info = obj.getRect(this.model.now);
      intf.drawFrame(this.canvas, info);
    }
  }

  beginStroke(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }

  stroke(info) {
    if (VIEW_EARLY_DRAW && info.userId === this.viewId) {return;}
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
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

  addBitmap(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
    this.updateButtons();
  }

  reframe(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }

  finishReframe(info) {
    this.updateButtons();
  }

  clear() {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }

  select(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }

  timeChanged(arg) {
    return Object.assign(arg, {message: 'seek', time: arg.time});
  }

  clock(obj) {
    // this method is called only when the model got a new clock
    let intf = new Interface();
    // this.model.commands.leave(this.model.now, this.canvas, this.cache);

    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);

    this.elements.time.valueAsNumber = this.model.now;
    this.elements.readout.textContent = this.model.now.toFixed(2);
    this.toggleGoStop();
    this.updateButtons();
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

    this.cache.resetFor(this.canvas);
  }

  undo(obj) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
    this.updateButtons();
    this.mySelection = null;
  }

  redo(obj) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
    this.mySelection = null;
    this.updateButtons();
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
    session = await Croquet.startSession("Drawing", DrawingModel, DrawingView, {tps: 30});
    return Promise.resolve('remote');
  }
}

start();
