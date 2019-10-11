/* global YT */

import * as Croquet from '@croquet/croquet';

let isLocal = true;
let session;


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

const VIEW_EARLY_DRAW = true;

class Command {
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
}

let cache = new Map();


class Interface {
  doCommand(canvas, command) {
    if (command.type === 'stroke') {
      this.newSegment(canvas, command.info);
    } else if (command.type === 'clear') {
      this.clear(canvas);
    }
  }

  newSegment(canvas, obj) {
    let {x0, y0, x1, y1, color} = obj;
    let ctx = canvas.getContext('2d');

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  clear(canvas) {
    let img = new ImageData(canvas.width, canvas.height);
    canvas.getContext('2d').putImageData(img, 0, 0);
  }

  sliceCommandsBetween(commands, baseTime, now) {
    let oneOff = commands.findIndex((c) => baseTime <= c.time);
    let base;
    let end;
    if (oneOff < 0) {
      base = commands.length;
    } else if (oneOff === 0) {
      base = 0;
    } else {
      base = oneOff - 1;
    }

    function findIndexLast(array, func) {
      for (let i = array.length - 1; i >= 0; i--) {
        let elem = array[i];
        if (func(elem)) {
          return i;
        }
      }
      return -1;
    }

    if (now === 0) {
      end = 0;
    } else {
      end = findIndexLast(commands, (c) => c.time < now);
      if (end < 0) {
        end = commands.length + 1;
      } else {
        end = end + 1;
      }
    }

    return commands.slice(base, end);
  }

  findClosestBitmap(model, now) {
    let arr = cache.get(model);
    let prev;

    for (let i = 0; i < arr.length; i++) {
      prev = arr[i];
      let next = arr[i + 1];

      if (!next || prev.time <= now && now < next.time) {
        break;
      }
    }
    return prev;
  }

  emptyImageData(width, height) {
    return new ImageData(width, height).data;
  }
}

class DrawingModel extends M {
  // commands: [{time, command: Command}];
  // redoCommands; [{time, command: Command}];

  // lastPoints: {[id:string]: PointData};
  // colors: {[id:string]: Color};

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
      }
    }
  }

  init() {
    this.lastPoints = {};
    this.colors = {};
    this.commands = [];
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

  addCommand(type, info, now) {
    let closest = new Interface().findClosestBitmap(this, now);
    let arr = cache.get(this);
    if (!closest || now - closest.time > 1 /* seconds */) {
      arr.push({time: now, state: this.canvas.getContext('2d').getImageData(0, 0, this.canvas.width, this.canvas.height).data});
      arr.sort((a, b) => a.time - b.time);
    }
    this.commands.push({time: now, command: new Command(type, info)});
    this.commands.sort((a, b) => a.time - b.time);
  }

  viewJoin(viewId) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 500;
    this.canvas.height = 500;
    cache.set(this, [
      {
        time: 0,
        state: new Interface().emptyImageData(this.canvas.width, this.canvas.height),
      }
    ]);
    console.log('canvas created');
    this.color({viewId: viewId, color: '#000'});
  }

  viewExit(viewId) {
    console.log("view exit " + viewId);
    delete this.lastPoints[viewId];
    delete this.colors[viewId];
  }

  color(obj) {
    this.colors[obj.userId] = obj.color;
  }

  beginStroke(obj) {
    this.lastPoints[obj.userId] = {x: obj.x, y: obj.y};
    let info = {color: this.colors[obj.userId] || 'black', ...obj};
    this.addCommand('beginStroke', obj, this.now);
    return obj;
  }

  stroke(obj) {
    let {userId, x0, y0, x1, y1, color} = obj;
    let old = this.lastPoints[userId];
    this.lastPoints[userId] = {x1, y1};
    new Interface().newSegment(this.canvas, obj);
    this.addCommand('stroke', obj, this.now);
    return Object.assign({message: 'stroke'}, obj);
  }

  finishStroke(obj) {
    let {userId, x, y} = obj;
    /* 
    let old = this.lastPoints[userId];
    let color = this.colors[userId];

    this.lastPoints[userId] = {x, y};

    let result = {
      userId,
      x0: old.x,
      y0: old.y,
      x1: x,
      y1: y,
      color
    };
    this.lastPoints[userId] = {x, y};
    */
    
    this.lastPoints[obj.userId] = null;
    this.addCommand('finishStroke', obj, this.now);
    return Object.assign({message: 'finishStroke'}, obj);
  }

  clear(obj) {
    new Interface().clear(this.canvas);
    this.addCommand('clear', {}, this.now);
    return obj;
  }

  setColor(obj) {
    this.colors[obj.userId] = obj;
    return obj;
  }

  clock(obj) {
    this.now = obj.time;
    let intf = new Interface();
    let closest = intf.findClosestBitmap(this, this.now);
    if (!closest) {return;}
    let commands = intf.sliceCommandsBetween(this.commands, closest.time, this.now);

    this.canvas.getContext('2d').putImageData(new ImageData(closest.state, this.canvas.width, this.canvas.height), 0, 0);

    commands.forEach((c) => {
      intf.doCommand(this.canvas, c.command);
    });
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
    if (!this.player) {return;}

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
    this.canvas.width = width;
    this.canvas.height = height;
    cache.set(this, [
      {
        time: 0,
        state: new Interface().emptyImageData(this.canvas.width, this.canvas.height),
      }
    ]);
    this.commands = [];
    return obj;
  }

  tick() {
    this.future(50).tick();
    if (!this.playing) {
      return;
    }

    this.now += 0.05;
    if (this.now > 20) {
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

    this.messages = {
      'mouseDown': 'mouseDown',
      'mouseMove': 'mouseMove',
      'mouseUp': 'mouseUp',
      'clearPressed': 'clearPressed',
      'goStopPressed': 'goStopPressed',
      'loadPressed': 'loadPressed',
      'colorSelected': 'colorSelected',
      'timeChanged': 'timeChanged',
      'clock': 'clock',
      'clear': 'clear',
      'toggleGoStop': 'toggleGoStop',
      'load': 'load',
      'configure': 'configure',
    };

    this.subscribe(this.modelId, "message-m", this.dispatch);

    this.content = document.querySelector("#draw-content");
    this.canvas = this.content.querySelector("#canvas");

    this.loadButton = this.content.querySelector("#load");
    this.movieId = this.content.querySelector("#movieId");

    this.clearButton = this.content.querySelector("#clearButton");
    this.black = this.content.querySelector("#black");
    this.blue = this.content.querySelector("#blue");
    this.red = this.content.querySelector("#red");

    this.time = this.content.querySelector("#time");
    this.time.valueAsNumber = 0;
    this.goStop = this.content.querySelector("#goStop");
    this.readout = this.content.querySelector("#readout");
    this.backstop = this.content.querySelector("#backstop");

    this.mousedown = (evt) => this.dispatch(Object.assign(
      {message: 'mouseDown'}, this.cookEvent(evt)));
    
    this.mousemove = (evt) => this.dispatch(Object.assign(
      {message: 'mouseMove'}, this.cookEvent(evt)));
    this.mouseup = (evt) => this.dispatch(Object.assign(
      {message: 'mouseUp'}, this.cookEvent(evt)));
    this.clearHandler = (evt) => this.dispatch({message: 'clearPressed'})

    this.colorHandler = (evt) => this.dispatch({message: 'colorSelected', color: evt.target.id});
    
    this.timeHandler = (evt) => this.dispatch({message: 'timeChanged', time: this.time.valueAsNumber});
    this.goStopHandler = (evt) => this.dispatch({message: 'goStopPressed'});
    this.loadHandler = (evt) => this.dispatch({message: 'loadPressed'});

    this.canvas.addEventListener("mousedown", this.mousedown);
    this.canvas.addEventListener("mousemove", this.mousemove);
    this.canvas.addEventListener("mouseup", this.mouseup);
    this.clearButton.addEventListener("click", this.clearHandler);

    this.black.addEventListener("click", this.colorHandler);
    this.blue.addEventListener("click", this.colorHandler);
    this.red.addEventListener("click", this.colorHandler);
    
    this.time.addEventListener("change", this.timeHandler);
    this.time.addEventListener("input", this.timeHandler);
    this.goStop.addEventListener("click", this.goStopHandler);
    this.loadButton.addEventListener("click", this.loadHandler);
  }

  detach() {
    this.canvas.removeEventListener("mousedown", this.mousedown);
    this.canvas.removeEventListener("mousemove", this.mousemove);
    this.canvas.removeEventListener("mouseup", this.mouseup);
    this.clearButton.removeEventListener("click", this.clearEvent);

    this.black.removeEventListener("click", this.colorHandler);
    this.blue.removeEventListener("click", this.colorHandler);
    this.red.removeEventListener("click", this.colorHandler);

    this.time.removeEventListener("change", this.timeHandler);
    this.time.removeEventListener("input", this.timeHandler);
    this.goStop.removeEventListener("click", this.goStopHandler);
    this.loadButton.removeEventListener("click", this.loadHandler);
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
    return Object.assign({message: 'beginStroke'}, this.lastPoint);
  }

  mouseMove(evt) {
    if (this.lastPoint !== null) {
      let newPoint = {userId: this.viewId, x: evt.offsetX, y: evt.offsetY};
      if (this.lastPoint.x === newPoint.x && this.lastPoint.y === newPoint.y) {return undefined;}
      let color = this.model.colors[this.viewId];
      let stroke = {
        message: 'stroke',
        x0: this.lastPoint.x, y0: this.lastPoint.y,
        x1: newPoint.x, y1: newPoint.y, color
      };
      if (VIEW_EARLY_DRAW) {
        this.newSegment(Object.assign({userId: '___'}, stroke));
      }
      this.lastPoint = newPoint;
      return Object.assign({userId: this.viewId}, stroke);
    }
    return undefined;
  }

  mouseUp(evt) {
    this.lastPoint = null;
    return {message: 'finishStroke', userId: this.viewid, x: evt.offsetX, y: evt.offsetY};
  }

  newSegment(obj) {
    if (VIEW_EARLY_DRAW && obj.userId === this.viewId) {return;}
    new Interface().newSegment(this.canvas, obj);
  }

  goStopPressed(arg) {
    return {message: 'toggleGoStop'};
  }

  colorSelected(arg) {
    return {message: 'color', userId: this.viewId, color: arg.color};
  }

  loadPressed(arg) {
    return {message: 'load', movieId: this.movieId.textContent};
  }

  clearPressed(arg) {
    return {message: 'clear'};
  }

  clear() {
    new Interface().clear(this.canvas);
  }

  timeChanged(arg) {
    return Object.assign(arg, {message: 'seek', time: arg.time});
  }

  clock(obj) {
    let intf = new Interface();
    let closest = intf.findClosestBitmap(this.model, this.model.now);
    if (!closest) {return;}
    let commands = intf.sliceCommandsBetween(this.model.commands, closest.time, this.model.now);

    this.canvas.getContext('2d').putImageData(new ImageData(closest.state, this.canvas.width, this.canvas.height), 0, 0);

    commands.forEach((c) => {
      intf.doCommand(this.canvas, c.command);
    });

    this.time.valueAsNumber = this.model.now;
    this.readout.textContent = this.model.now.toFixed(2);
  }

  toggleGoStop() {
    this.goStop.textContent = this.model.playing ? "Stop" : "Go";
  }

  configure(obj) {
    let {width, height, length} = obj;
    this.canvas.width = width;
    this.canvas.height = height;
    this.time.max = length;

    this.backstop.style.setProperty("width", width + "px");
    this.backstop.style.setProperty("height", height + "px");
  }

  clear(obj) {
    new Interface().clear(this.canvas);
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
