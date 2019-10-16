/* global YT */

import * as Croquet from '@croquet/croquet';

import {Cache, Command, CommandArray, toKey} from './data.js';

let isLocal = true;
let session;

const VIEW_EARLY_DRAW = true;

class FutureHandler {
  constructor(tOffset) {
    this.tOffset = tOffset || 0;
  }
    
  setup(target) {
    let that = this;
    return new Proxy(target, {
      get(_target, property) {
        if (typeof target[property] === "function") {
          return new Proxy(target[property], {
            apply(method, _this, args) {
              setTimeout(() => method.apply(target, args), that.tOffset);
            }
          });
        }
      }
    });
  }
}

class MockModel {
  constructor() {
    this.id = 'abc';
  }
  static create() {return new this();}
  static register() {}
  
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

let modelCanvas;
function ensureModelCanvas() {
  if (!modelCanvas) {
    modelCanvas = document.createElement('canvas');
    modelCanvas.width = 500;
    modelCanvas.height = 500;
  }
  return modelCanvas;
}

let cache;
function ensureCache() {
  if (!cache) {
    cache = new Cache();
  }
  return cache;
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
          let {keys, data} = c;
          return {keys, data};
        },
        read: (obj) => {
          let c = new CommandArray();
          c.keys = obj.keys;
          c.data = obj.data;
          return c;
        }
      }
    }
  }

  init() {
    this.commands = new CommandArray();
    this.redoCommands = [];
    this.now = 0;
    this.playing = false;

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

    window.model = this;

    this.future(50).tick();
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

  addCommand(userId, type, info) {
    this.commands.add(this.now, userId, new Command(type, info));
  }

  viewJoin(viewId) {
    ensureModelCanvas();
    ensureCache();
    cache.resetFor(modelCanvas);
  }

  viewExit(viewId) {
    console.log("view exit " + viewId);
  }

  beginStroke(obj) {
    this.addCommand(obj.userId, 'beginStroke', obj);
    return obj;
  }

  stroke(obj) {
    ensureModelCanvas();
    let {userId, x1, y1} = obj;
    new Interface().newSegment(modelCanvas, obj);
    this.addCommand(userId, 'stroke', obj);
    return Object.assign({message: 'stroke'}, obj);
  }

  finishStroke(obj) {
    let {userId, x, y} = obj;
    this.addCommand(userId, 'finishStroke', obj);
    return Object.assign({message: 'finishStroke'}, obj);
  }

  clear(obj) {
    ensureModelCanvas();
    new Interface().clear(modelCanvas);
    this.addCommand(obj.userId, 'clear', {});
    return obj;
  }

  undo(obj) {
    if (this.commands.getCommandCount() === 0) {return undefined;}
    let actions = this.commands.undo(this.now);
    this.redoCommands.unshift(actions);

    this.commands.applyCommandsTo(modelCanvas, this.now, cache, new Interface());
    
    return obj;
  }

  redo(obj) {
    let actions = this.redoCommands.shift();
    if (actions) {
      actions.forEach((c) => {
        this.commands.add(this.now, c.userId, c.command);
      });
      this.commands.applyCommandsTo(modelCanvas, this.now, cache, new Interface());
      return obj;
    }
    return undefined;
  }

  clock(obj) {
    if (this.now !== obj.time) {
      this.commands.leave(this.now, modelCanvas, cache);
    }
    this.now = obj.time;
    if (!cache) {
      cache = new Cache();
    }
    this.commands.applyCommandsTo(modelCanvas, this.now, cache, new Interface());
    return obj;
  }

  seek(obj) {
    if (this.player) {
      this.player.seekTo(obj.time);
    } else {
      return this.clock({message: 'clock', time: obj.time});
    }
  }

  toggleGoStop(obj) {
    this.playing = !this.playing;
    if (!this.player) {return obj;}

    if (this.playing) {
      this.player.playVideo();
    } else {
      this.player.pauseVideo();
    }
    return obj;
  }

  load(obj) {
    let movieId = obj.movieId;

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

  configure(obj) {
    let {width, height} = obj;
    modelCanvas.width = width;
    modelCanvas.height = height;

    cache.resetFor(modelCanvas);
    this.commands = new CommandArray();
    return obj;
  }

  tick() {
    this.future(50).tick();
    if (!this.playing) {
      return;
    }

    this.now += 0.05;
    if (this.now >= 20) {
      this.now = 20;
      this.playing = false;
    }
    this.dispatch({message: 'clock', time: this.now});
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
      'stroke': 'stroke',
      'finishStroke': 'finishStroke',
      'clearPressed': 'clearPressed',
      'goStopPressed': 'goStopPressed',
      'loadPressed': 'loadPressed',
      'timeChanged': 'timeChanged',
      'undoPressed': 'undoPressed',
      'redoPressed': 'redoPressed',
      'clock': 'clock',
      'clear': 'clear',
      'undo': 'undo',
      'redo': 'redo',
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
    };

    this.elements = {};
    ['canvas', 'loadButton', 'movieId', 'clearButton','eraser', 'black', 'blue', 'red', 'undoButton', 'redoButton', 'time', 'goStop', 'readout', 'backstop'].forEach((n) => this.elements[n] = this.content.querySelector('#' +  n));

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
            offsetX: evt.offsetX, offsetY: evt.offsetY};
  }

  dispatch(arg) {
    if (arg === undefined) {return;}
    let mth = this.messages[arg.message];
    if (!mth || !this[mth]) {return;}
    let value = this[mth](arg);
    if (value === undefined) {return;}

    if (!value.message) {value.message = arg.message;}
    if (isLocal) {
      session.model.dispatch(value);
    } else {
      this.publish(this.modelId, "message", value);
    }
  }

  mouseDown(evt) {
    this.lastPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY};
    this.strokeId = newId();
    return Object.assign({message: 'beginStroke', color: this.color, strokeId: this.strokeId}, this.lastPoint);
  }

  mouseMove(evt) {
    if (this.lastPoint !== null) {
      let newPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY};
      if (this.lastPoint.x === newPoint.x && this.lastPoint.y === newPoint.y) {return undefined;}
      let color = this.color;
      let stroke = {
        message: 'stroke',
        x0: this.lastPoint.x, y0: this.lastPoint.y,
        x1: newPoint.x, y1: newPoint.y, color
      };
      if (VIEW_EARLY_DRAW) {
        this.stroke(Object.assign({userId: '___'}, stroke));
      }
      this.lastPoint = newPoint;
      return Object.assign({userId: this.viewId, strokeId: this.strokeId}, stroke);
    }
    return undefined;
  }

  mouseUp(evt) {
    this.lastPoint = null;
    let strokeId = this.strokeId;
    this.strokeId = null;
    return {message: 'finishStroke', userId: this.viewId, strokeId: strokeId, x: evt.offsetX, y: evt.offsetY};
  }

  stroke(obj) {
    if (VIEW_EARLY_DRAW && obj.userId === this.viewId) {return;}
    new Interface().newSegment(this.canvas, obj);
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

  clear() {
    new Interface().clear(this.canvas);
  }

  timeChanged(arg) {
    return Object.assign(arg, {message: 'seek', time: arg.time});
  }

  clock(obj) {
    this.clear();
    this.canvas.getContext('2d').drawImage(modelCanvas, 0, 0);

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
  }

  undo(obj) {
    this.clear();
    this.canvas.getContext('2d').drawImage(modelCanvas, 0, 0);
    this.updateButtons();
  }

  redo(obj) {
    this.clear();
    this.canvas.getContext('2d').drawImage(modelCanvas, 0, 0);
    this.updateButtons();
  }

  updateButtons() {
    if (this.model.commands.getCommandCount() > 0) {
      this.elements.undoButton.classList.remove('disabled');
    } else {
      this.elements.undoButton.classList.add('disabled');
    }
    
    if (this.model.redoCommands.length > 0) {
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
