/* global YT */

import * as Croquet from '@croquet/croquet';

//import {Cache, Command, CommandArray, toKey, Bitmap} from './data.js';
import {load} from './bitmap.js';
import {Objects, Stroke, Bitmap} from './timeObject.js';

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

function newId() {
  function hex() {
    let r = Math.random();
    return Math.floor(r * 256).toString(16).padStart(2, "0");
  }
  return`${hex()}${hex()}${hex()}${hex()}`;
}

class Interface {
  newSegment(canvas, obj) {
    let {x0, y0, x1, y1, color} = obj;
    let ctx = canvas.getContext('2d');

    ctx.strokeStyle = color;
    
    ctx.lineWidth = color === 'white' ? 4 : 2;

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
    canvas.getContext('2d').drawImage(glyph, 0, 0, glyph.width, glyph.height, info.x, info.y, info.width, info.height);
  }

  drawFrame(canvas, info) {
    let ctx = canvas.getContext('2d');
    ctx.lineWidth = 4;
    ctx.strokeStrike = 'gray';
    ctx.beginPath();
    ctx.rect(info.x, info.y, info.width, info.height);
    ctx.stroke();
  }
}

class DrawingModel extends M {
  static types() {
    return {
      Bitmap: {
        cls: Bitmap,
        write: (c) => {
          let {name, id, keys, data} = c;
          return {name, id, keys, data};
        },
        read: (obj) => {
          let b = new Bitmap(obj.id, obj.name);
          b.keys = obj.keys;
          b.data = obj.data;
          return b;
        }
      },
      Stroke: {
        cls: Stroke,
        write: (c) => {
          let {id, keys, data} = c;
          return {id, keys, data};
        },
        read: (obj) => {
          let s = new Stroke(obj.id);
          s.keys = obj.keys;
          s.data = obj.data;
          return s;
        }
      },
      Objects: {
        cls: Objects,
        write: (c) => {
          let {id, keys, data} = c;
          return {id, keys, data};
        },
        read: (obj) => {
          let o = new Objects(obj.id);
          o.keys = obj.keys;
          o.data = obj.data;
          return o;
        }
      }
    }
  }

  init() {
    this.objects = new Objects(newId());

    this.now = 0;
    this.playing = false;
    this.canvasExtent = {width: 500, height: 500};

    this.messages = {
      'beginStroke': 'beginStroke',
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'addBitmap': 'addBitmap',
      'reframeBitmap': 'reframeBitmap',
      'removeBitmap': 'removeBitmap',
      'color': 'color',
      'clear': 'clear',
      'undo': 'undo',
      'redo': 'redo',
      'bitmapSelect': 'bitmapSelect',
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

  add(obj, info) {
    obj.add(this.now, info);
  }

  addSelection(userId, obj) {
    let current = this.objects.last(this.now);
    let newSelections = Object.assign({}, current.selections, {[userId]: obj});
    this.objects.add(this.now, {...current, selections: newSelections});
  }

  removeSelection(userId) {
    let current = this.objects.last(this.now);
    let {[userId]: _delete, ...newSelections} = current.selections;
    this.objects.add(this.now, {...current, selections: newSelections});
  }

  getSelections() {
    let current = this.objects.last(this.now);
    return current.selections;
  }

  viewJoin(viewId) {}

  viewExit(viewId) {}

  beginStroke(info) {
    this.removeSelection(info.userId);
    let current = this.objects.last(this.now);
    let obj = new Stroke(info.objectId);
    let newObjects = Object.assign({}, current, {objects: [...current.objects, obj]});
    this.objects.add(this.now, newObjects);
    return info;
  }

  stroke(info) {
    let obj = this.objects.get(this.now, info.objectId);
    this.add(obj, info);
    return info;
  }

  finishStroke(info) {
    let current = this.objects.last(this.now);
    let newObjects = Object.assign({}, current, {history: [...current.history, info.objectId]});
    this.objects.add(this.now, newObjects);
    return info;
  }

  addBitmap(info) {
    this.removeSelection(info.userId);
    let current = this.objects.last(this.now);
    let obj = new Bitmap(info.objectId, info.name);
    obj.add(this.now, info);
    
    let newObjects = Object.assign({}, current, {objects: [...current.objects, obj]});
    this.objects.add(this.now, newObjects);
    return info;
  }

  reframeBitmap(info) {
    let obj = this.objects.get(this.now, info.objectId);
    this.add(obj, info);
    return info;
  }

  bitmapSelect(info) {
    let {x, y, userId} = info;
    this.removeSelection(userId);

    let includesPoint = (rect, x, y) => {
      return (rect.x <= x && x < rect.width + rect.x &&
              rect.y <= y && y < rect.height + rect.y);
    };

    let find = (x, y) => {
      let current = this.objects.last(this.now);
      let objects = current.objects;
      for (let i = objects.length - 1; i >= 0; i--) {
        let obj = objects[i];
        if (obj.constructor === Bitmap) {
          let rect = obj.last(this.now);
          if (includesPoint(rect, x, y)) {
            return [obj, rect];
          }
        }
      }
      return [null, null];
    };

    let [obj, position] = find(x, y);
    if (obj) {
      this.addSelection(userId, obj);
      obj.add(this.now, Object.assign({select: true}, position));
      return {message: 'bitmapSelect', userId, name: obj.name, id: obj.id, rect: position};
    }
    return undefined;
  }

  clear(info) {
    let current = this.objects.last(this.now);
    let newObjects = Object.assign({}, current, {objects: []});
    this.objects.add(this.now, newObjects);
    return info;
  }

  undo(info) {
    let current = this.objects.last(this.now);
    if (current.history.length === 0) {return undefined;}
    
    let newHistory = [...current.history];
    let id = newHistory.shift();

    let obj = this.objects.get(this.now, id);
    obj.undo(this.now);

    let newRedoHistory = [obj.id, ... current.redoHistory];

    this.objects.add(this.now, {objects: current.objects, history: newHistory, redoHistory: newRedoHistory, selections: current.selections});
    
    return info;
  }

  redo(info) {
    let current = this.objects.last(this.now);
    if (current.redoHistory.length === 0) {return undefined;}

    let newRedoHistory = [...current.redoHistory];
    let id = newRedoHistory.shift();

    
    
    let actions = this.redoCommands.shift();
    if (actions) {
      actions.forEach((c) => {
        this.commands.add(this.now, c.userId, c.command);
      });
      return info;
    }
    return undefined;
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
      'reframeBitmap': 'reframeBitmap',
      'bitmapSelect': 'bitmapSelect',
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
    this.lastPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY};

    if (evt.shiftKey) {
      console.log('shift');
      let includesPoint = (selection, lastPoint) => {
        if (selection) {
          return (selection.x <= lastPoint.x && lastPoint.x < selection.x + selection.width &&
                  selection.y <= lastPoint.y && lastPoint.y < selection.y + selection.height);
        }
        return false;
      };

      if (this.mySelection) {
        if (includesPoint(this.mySelection, this.lastPoint)) {
          this.moveSelection = this.mySelection;
          this.movePoint = {origX: this.mySelection.x, origY: this.mySelection.y, x: evt.offsetX, y: evt.offsetY};
        }
      }
      return {message: 'bitmapSelect', ...this.lastPoint};
    }
    
    this.strokeId = newId();
    return Object.assign({message: 'beginStroke', color: this.color, objectId: this.strokeId}, this.lastPoint);
  }

  mouseMove(evt) {
    if (this.lastPoint !== null) {
      let newPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY};
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
        return Object.assign({userId: this.viewId, objectId: this.strokeId}, stroke);
      }
      if (this.moveSelection) {
        let {name, x, y, width, height, objectId, userId} = this.moveSelection;
        return {message: 'reframeBitmap', name,
                x: this.movePoint.origX + (newPoint.x - this.movePoint.x),
                y: this.movePoint.origY + (newPoint.y - this.movePoint.y),
                width, height, objectId, userId};
      }
    }
    return undefined;
  }

  mouseUp(evt) {
    this.lastPoint = null;
    this.moveSelection = null;
    this.movePoint = null;
    let strokeId = this.strokeId;
    this.strokeId = null;
    return {message: 'finishStroke', userId: this.viewId, objectId: strokeId, x: evt.offsetX, y: evt.offsetY};
  }

  drawFrames(intf) {
    let current = this.model.objects.last(this.model.now);
    let selections = current.selections;
    for (let k in selections) {
      let obj = selections[k];
      let info = obj.last(this.model.now);
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
  }

  reframeBitmap(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }
  
  clear() {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
  }

  bitmapSelect(info) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    this.drawFrames(intf);
    if (info.userId === this.viewId) {
      this.mySelection = info.rect;
    }
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
    let intf = new Interface(this.model.bitmaps);
    this.clear();
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
    this.updateButtons();
  }

  redo(obj) {
    let intf = new Interface(this.model.bitmaps);
    this.clear();
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
    this.updateButtons();
  }

  updateButtons() {
    let last = this.model.objects.last(this.model.now);
    if (last.history.length > 0) {
      this.elements.undoButton.classList.remove('disabled');
    } else {
      this.elements.undoButton.classList.add('disabled');
    }
    
    if (last.redoHistory.length > 0) {
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
