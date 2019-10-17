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
    let img = new ImageData(canvas.width, canvas.height);
    canvas.getContext('2d').putImageData(img, 0, 0);
  }

  emptyImageData(width, height) {
    return new ImageData(width, height).data;
  }

  drawBitmap(canvas, bitmap, time) {
    let position = bitmap.findLast(time);
    let glyph = bitmaps[bitmap.name];
    canvas.getContext('2d').drawImage(glyph, 0, 0, glyph.width, glyph.height, position.x, position.y, position.width, position.height);
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
      Command: {
        cls: Command,
        write: (c) => {
          let {type, info} = c;
          return {type, info};
        },
        read: (obj) => {
          return new Command(obj.type, obj.info);
        }
      },
      CommandArray: {
        cls: CommandArray,
        write: (c) => {
          let {keys, data, commandCount} = c;
          return {keys, data, commandCount};
        },
        read: (obj) => {
          let c = new CommandArray();
          c.keys = obj.keys;
          c.data = obj.data;
          c.commandCount = obj.commandCount;
          return c;
        }
      }
    }
  }

  init() {
    this.objects = new Objects(newId()); // {id: Stroke|Bitmap}
    this.history = [];
    // [id]  For each undoable action on an object,
    // a undoable sequence is added to the object's timeline, and then one id is added here. 
    // undo is to take the last element from history, find out which object to undo, take a undoable action sequence from the object, and move it to redo;
    this.redoHistory = [];

    this.selections = {};

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

  addSelection(userId, info) {
    this.selections[userId] = info;
  }

  removeSelection(userId) {
    delete this.selections[userId];
  }

  viewJoin(viewId) {}

  viewExit(viewId) {}

  beginStroke(info) {
    // this.removeSelection(info.userId);
    let current = this.objects.last(this.now);
    let obj = new Stroke(info.objectId);
    this.objects.add(this.now, [...current, obj]);
    return info;
  }

  stroke(info) {
    let obj = this.objects.get(this.now, info.objectId);
    this.add(obj, info);
    return info;
  }

  finishStroke(info) {
    this.history.push(info.objectId);
    return info;
  }

  addBitmap(info) {
    let userId = info.userId;
    this.addCommand(userId, 'addBitmap', info);
    this.addCommand(userId, 'reframeBitmap', info);
    return info;
  }

  reframeBitmap(obj) {
    let ind = this.bitmaps.findIndex((b) => b.id === obj.id);
    if (ind >= 0) {
      this.bitmaps[ind] = obj;
    }
    this.addCommand(obj.userId, 'reframeBitmap', obj);
    return obj;
  }

  bitmapSelect(obj) {
    let {x, y, userId} = obj;
    this.removeSelection(userId);

    let includesPoint = (info, x, y) => {
      return (info.x <= x && x < info.width + info.x &&
              info.y <= y && y < info.height + info.y);
    };

    let find = (x, y) => {
      for (let i = this.bitmaps.length - 1; i >= 0; i--) {
        if (includesPoint(this.bitmaps[i], x, y)) {
          return this.bitmaps[i];
        }
      }
      return null;
    };

    let maybe = find(x, y);
    if (maybe) {
      this.addSelection(userId, maybe);
      return {message: 'bitmapSelect', userId, userId, name: maybe.name, id: maybe.id};
    }
    return undefined;
  }

  clear(info) {
    let obj = this.objects;
    this.add(obj, {});
    return info;
  }

  undo(info) {
    if (this.commands.getCommandCount() === 0) {return undefined;}
    let actions = this.commands.undo(this.now);
    this.redoCommands.unshift(actions);

    return info;
  }

  redo(info) {
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

      if (this.mySelection && includesPoint(this.mySelection, this.lastPoint)) {
        this.moveSelection = this.mySelection;
        this.movePoint = {origX: this.mySelection.x, origY: this.mySelection.y, x: evt.offsetX, y: evt.offsetY};
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
        let {name, x, y, width, height, id, userId} = this.moveSelection;
        let actionId = newId();
        return {message: 'reframeBitmap', name,
                x: this.movePoint.origX + (newPoint.x - this.movePoint.x),
                y: this.movePoint.origY + (newPoint.y - this.movePoint.y),
                width, height, id, userId, actionId};
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
    for (let k in this.model.selections) {
      let selection = this.model.selections[k];
      let info = this.model.bitmaps.find((b) => b.id === selection.id);
      intf.drawFrame(this.canvas, info);
    }
  }

  beginStroke(obj) {
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    //this.drawFrames(intf);
  }

  stroke(obj) {
    if (VIEW_EARLY_DRAW && obj.userId === this.viewId) {return;}
    let intf = new Interface();
    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    // this.drawFrames(intf);
  }

  

  finishStroke(obj) {
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
      return {message: 'addBitmap', name: name, x: 100, y: 100, width: bits.width, height: bits.height, id, userId: this.viewId};
    }
    return undefined;
  }

  addBitmap(obj) {
    let intf = new Interface(this.model.bitmaps);
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
  }

  reframeBitmap(obj) {
    let intf = new Interface(this.model.bitmaps);
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
  }
  
  clear() {
    let intf = new Interface(this.model.bitmaps);
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
  }

  bitmapSelect(obj) {
    let intf = new Interface(this.model.bitmaps);
    this.model.commands.applyCommandsTo(this.canvas, this.model.now, this.cache, intf);
    this.drawFrames(intf);
    if (obj.userId === this.viewId) {
      this.mySelection = this.model.selections[this.viewId];
    }
  }

  timeChanged(arg) {
    return Object.assign(arg, {message: 'seek', time: arg.time});
  }

  clock(obj) {
    // this method is called only when the model got a new clock
    let intf = new Interface(this.model.bitmaps);
    // this.model.commands.leave(this.model.now, this.canvas, this.cache);

    this.model.objects.applyTo(this.canvas, this.model.now, intf);
    // this.drawFrames(intf);

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
