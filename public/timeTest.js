/******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/timeTest.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/timeObject.js":
/*!***************************!*\
  !*** ./src/timeObject.js ***!
  \***************************/
/*! exports provided: newId, Transform, Bitmap, Stroke, Objects, Action */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"newId\", function() { return newId; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Transform\", function() { return Transform; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Bitmap\", function() { return Bitmap; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Stroke\", function() { return Stroke; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Objects\", function() { return Objects; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Action\", function() { return Action; });\nfunction toKey(n) {\n  return Math.trunc(n * 1000);\n}\n\nfunction newId() {\n  function hex() {\n    let r = Math.random();\n    return Math.floor(r * 256).toString(16).padStart(2, \"0\");\n  }\n  return`${hex()}${hex()}${hex()}${hex()}`;\n}\n\nfunction findIndexFor(timeKey, obj, low, high) { // low is inclusive high is exclusive\n  if (high === low) {\n    return [low, true];\n  }\n\n  if (high - 1 === low) {\n    if (timeKey < obj.keys[low]) {\n      return [low, true];\n    }\n    if (timeKey === obj.keys[low]) {\n      return [low, false];\n    }\n    return [low + 1, true];\n  }\n\n  let mid = Math.floor((high + low) / 2);\n  if (timeKey < obj.keys[mid]) {\n    return findIndexFor(timeKey, obj, low, mid);\n  } else if (timeKey === obj.keys[mid]) {\n    return [mid, false];\n  } else {\n    return findIndexFor(timeKey, obj, mid, high);\n  }\n}\n\nfunction findClosestIndex(timeKey, obj) {\n  let [ind, notFound] = findIndexFor(timeKey, obj, 0, obj.keys.length);\n  return notFound ? ind - 1 : ind;\n}\n\nfunction findLast(time, obj) {\n  let timeKey = toKey(time);\n  let ind = findClosestIndex(timeKey, obj);\n  let array = obj.data.get(obj.keys[ind]);\n  if (!array) {return undefined;}\n  return array[array.length - 1];\n}\n\nclass Transform {\n  static scale(time, n) {\n    let t = new Transform();\n    let ary = [n, 0, 0, 0, n, 0];\n    t.add(time, {message: 'scale', transform: ary});\n    return t;\n  }\n\n  static translate(time, x, y) {\n    let t = new Transform();\n    let ary = [1, 0, x, 0, 1, y];\n    t.add(time, {message: 'translate', transform: ary});\n    return t;\n  }\n\n  static rotate(time, theta) {}\n\n  constructor() {\n    let m1 = toKey(-1);\n    this.keys = [m1];\n    this.data = new Map();\n    this.data.set(m1, [{message: 'identity', transform: [1, 0, 0, 0, 1, 0]}]);\n    // this.data {message: <string, transform: [a11, a12, a13, a21, a22, a23]}\n  }\n\n  add(time, info) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push(info);\n  }\n\n  get(time) {\n    return findLast(time, this);\n  }\n\n  transformPoint(time, x, y) {\n    let r = this.get(time).transform;\n    return {x: r[0] * x + r[1] * y + r[2], y: r[3] * x + r[4] * y + r[5]};\n  }\n\n  setTranslation(time, x, y) {\n    let last = findLast(time, this).transform;\n    this.add(time, [last[0], last[1], x, last[3], last[4], y]);\n  }\n\n  undo(time, moveId) {\n    let timeKey = toKey(time);\n    let nowInd = findClosestIndex(timeKey, this);\n    for (let i = nowInd; i >= 0; i--) {\n      let e;\n      let ind;\n      let key = this.keys[i]\n      let array = this.data.get(key);\n      for (ind = array.length - 1; ind >= 0; ind--) {\n        e = array[ind];\n        if (e.message === 'firstReframe' && e.moveId === moveId) {\n          break;\n        }\n      }\n      if (ind < 0) {\n        this.data.delete(key);\n        this.keys.splice(i);\n      } else {\n        array.splice(ind);\n        return;\n      }\n    }\n  }\n}\n\nclass Bitmap {\n  constructor(id, name, width, height) {\n    this.id = id;\n    this.transform = new Transform();\n    let m1 = toKey(-1);\n    this.keys = [m1];\n    this.data = new Map();\n    this.data.set(m1, [{name, width, height}]);\n    // this.data {name, width, height}\n  }\n\n  addTransform(time, transform) {\n    this.transform.add(time, transform);\n  }\n\n  add(time, info) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push(info);\n  }\n\n  get(time) {\n    return findLast(time, this);\n  }\n\n  includesPoint(time, x, y) {\n    let last = this.get(time);\n    if (!last) {return false;}\n    let o = this.transform.transformPoint(time, 0, 0);\n    let c = this.transform.transformPoint(time, last.width, last.height);\n    return o.x <= x && x < c.x && o.y <= y && y < c.y;\n  }\n\n  getRect(time) {\n    let last = this.get(time);\n    let transform = this.transform.get(time).transform;\n    return {name: last.name, width: last.width, height: last.height, transform: transform};\n  }\n\n  reframe(time, info) {\n    let rect = this.getRect(time);\n    let t = rect.transform;\n    if (info.firstReframe) {\n      let moveId = newId();\n      this.add(time, {message: 'firstReframe', moveId, name: rect.name, width: rect.width, height: rect.height});\n      this.addTransform(time, {message: 'firstReframe', moveId, transform: rect.transform});\n    } else {\n      let newTransform = info.transform;\n      this.addTransform(time, {message: 'reframe', transform: newTransform});\n    }\n  }\n\n  finishReframe(time, info) {\n    let last = this.get(time);\n    let transform = this.transform.get(time).transform;\n\n    this.add(time, {message: 'finishReframe', name: last.name, width: last.width, height: last.height});\n\n    return new Action('finishReframe', {\n      message: 'reframe', objectId: info.objectId, width: last.width, height: last.height, oldTransform: info.transform, newTransform: transform\n    });\n  }\n\n  applyTo(canvas, time, intf) {\n    let last = this.get(time);\n    intf.drawBitmap(canvas, last.name, this.getRect(time));\n  }\n\n  undo(time) {\n    if (this.keys.length === 0) {return null;}\n\n    let timeKey = toKey(time);\n    let nowInd = findClosestIndex(timeKey, this);\n\n    let array = this.data.get(this.keys[nowInd]);\n    let last = array[array.length - 1];\n    let moveId;\n    \n    if (last.message === 'finishReframe') {\n      for (let i = nowInd; i >= 0; i--) {\n        let e;\n        let ind;\n        let key = this.keys[i]\n        let array = this.data.get(key);\n        for (ind = array.length - 1; ind >= 0; ind--) {\n          if (i === this.keys.length - 1 && ind === array.length - 1) {continue;}\n          e = array[ind];\n          if (e.message === 'firstReframe') {\n            moveId = e.moveId;\n            break;\n          }\n        }\n        if (ind <= 0) {\n          this.data.delete(key);\n          this.keys.splice(i);\n        } else {\n          array.splice(ind);\n          \n        }\n        if (moveId) {\n          this.transform.undo(time, moveId);\n          return;\n        }\n      }\n    }\n  }\n}\n\nclass Stroke {\n  constructor(id) {\n    this.id = id;\n    this.transform = new Transform();\n    this.keys = [];\n    this.data = new Map();\n    // this.data {x0, y0, x1, y1, lineWidth, color, ox, oy, width, height}\n    //           | reframe\n  }\n\n  add(time, info) {\n    let last = this.get(time) || {ox: Infinity, oy: Infinity, cx: -Infinity, cy: -Infinity, width: 0, height: 0};\n    let timeKey = toKey(time);\n    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n\n    let newInfo;\n    if (info.message !== \"stroke\") {\n      newInfo = info;\n    } else {\n      let ox = Math.min(last.ox, info.x0, info.x1);\n      let oy = Math.min(last.oy, info.y0, info.y1);\n      let cx = Math.max(last.cx, info.x0, info.x1);\n      let cy = Math.max(last.cy, info.y0, info.y1);\n      newInfo = {...info,\n                 ox,oy,\n                 cx, cy,\n                 width: cx - ox,\n                 height: cy - oy};\n    }\n    array.push(newInfo);\n  }\n\n  addTransform(time, transform) {\n    this.transform.add(time, transform);\n  }\n\n  get(time) {\n    return findLast(time, this);\n  }\n\n  includesPoint(time, x, y) {\n    let last = this.get(time);\n    let o = this.transform.transformPoint(time, last.ox, last.oy);\n    let c = this.transform.transformPoint(time, last.cx, last.cy);\n    return o.x <= x && x < c.x && o.y <= y && y < c.y;\n  }\n\n  getRect(time) {\n    let last = this.get(time);\n    let transform = this.transform.get(time).transform;\n    return {ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height, transform: transform};\n    // return {ox: rect.ox, oy: rect.oy, cx: rect.cx, cy: rect.cy};\n  }\n\n  reframe(time, info) {\n    let rect = this.getRect(time);\n    let t = rect.transform;\n    if (info.firstReframe) {\n      let moveId = newId();\n      this.add(time, {message: 'firstReframe', moveId, ox: rect.ox, oy: rect.oy, cx: rect.cx, cy: rect.cy, width: rect.width, height: rect.height});\n      this.addTransform(time, {message: 'firstReframe', moveId, transform: rect.transform});\n    } else {\n      let newTransform = info.transform;\n      this.addTransform(time, {message: 'reframe', transform: newTransform});\n    }\n  }\n\n  finishReframe(time, info) {\n    let last = this.get(time);\n    let transform = this.transform.get(time).transform;\n\n    this.add(time, {message: 'finishReframe', ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height});\n\n    return new Action('finishReframe', {\n      message: 'reframe', objectId: info.objectId, ox: last.ox, oy: last.oy, cx: last.cx, cy: last.cy, width: last.width, height: last.height, oldTransform: info.transform, newTransform: transform\n    });\n  }\n\n  applyTo(canvas, toTime, intf) {\n    let timeKey = toKey(toTime);\n    let endIndex = findClosestIndex(timeKey, this);\n    for (let i = 0; i <= endIndex; i++) {\n      let array = this.data.get(this.keys[i]);\n      array.forEach((segment) => {\n        let transform = this.transform.get(toTime).transform;\n        intf.newSegment(canvas, segment, transform);\n      });\n    }\n  }\n\n  undo(time) {\n    if (this.keys.length === 0) {return null;}\n\n    let timeKey = toKey(time);\n    let nowInd = findClosestIndex(timeKey, this);\n\n    let array = this.data.get(this.keys[nowInd]);\n    let last = array[array.length - 1];\n    let moveId;\n    \n    if (last.message === 'finishReframe') {\n      for (let i = nowInd; i >= 0; i--) {\n        let e;\n        let ind;\n        let key = this.keys[i]\n        let array = this.data.get(key);\n        for (ind = array.length - 1; ind >= 0; ind--) {\n          if (i === this.keys.length - 1 && ind === array.length - 1) {continue;}\n          e = array[ind];\n          if (e.message === 'firstReframe') {\n            moveId = e.moveId;\n            break;\n          }\n        }\n        if (ind <= 0) {\n          this.data.delete(key);\n          this.keys.splice(i);\n        } else {\n          array.splice(ind);\n          \n        }\n        if (moveId) {\n          this.transform.undo(time, moveId);\n          return;\n        }\n      }\n    }\n  }\n}\n\nclass Objects {\n  constructor(id) {\n    this.id = id;\n    this.objects = {}; // {id: {object: object, from: fromTimeKey, to: toTimeKey | undefined}\n  }\n\n  addObject(time, obj) {\n    this.objects[obj.id] = {object: obj, from: toKey(time)};\n  }\n\n  undoAddObject(object) {\n    let obj = this.objects[object.id].object;\n    delete this.objects[object.id];\n    return obj;\n  }\n\n  get(time, objectId) {\n    let timeKey = toKey(time);\n    let info = this.objects[objectId];\n    if (!info) {return null;}\n    if (info.from <= timeKey &&\n        (info.to === undefined || timeKey < info.to)) {\n      return info.object;\n    }\n    return null;\n  }\n\n  liveObjectsDo(time, func) {\n    let timeKey = toKey(time);\n\n    for (let k in this.objects) {\n      let obj = this.get(time, k);\n      if (obj) {\n        func(obj);\n      }\n    }\n  }\n\n  liveObjects(time) {\n    let timeKey = toKey(time);\n    let result = [];\n\n    for (let k in this.objects) {\n      let obj = this.get(time, k);\n      if (obj) {\n        result.push(obj);\n      }\n    }\n    return result;\n  }\n\n  undo(id, time) {\n    let obj = this.get(time, id);\n    return obj.undo();\n  }\n\n  killObjects(time) {\n    let timeKey = toKey(time);\n    let undo = {};\n    this.liveObjectsDo(time, (obj) => {\n      undo[obj.id] = {oldTo: this.objects[obj.id].to, newTo: timeKey};\n      this.objects[obj.id].to = timeKey;\n    });\n    return undo;\n  }\n\n  applyTo(canvas, time, intf) {\n    intf.clear(canvas);\n    this.liveObjectsDo(time, (obj) => obj.applyTo(canvas, time, intf));\n  }\n}\n\nclass Action {\n  constructor(type, info) {\n    this.type = type;\n    this.info = info;\n  }\n\n  redo(model) {\n    let objects = model.objects;\n    if (this.type === 'clear') {\n      for (let k in this.info) {\n        objects.objects[k].to = this.info[k].newTo;\n      }\n    } else if (this.type === 'addObject') {\n      objects.addObject(model.now, this.info);\n    } else if (this.type === 'finishReframe') {\n      let obj = objects.objects[this.info.objectId].object;\n      let last = obj.get(model.now);\n      let moveId = newId();\n      obj.add(model.now, {message: 'firstReframe', moveId, name: last.name, width: last.width, height: last.height});\n      obj.addTransform(model.now, {message: 'firstReframe', moveId, transform: this.info.oldTransform});\n      obj.add(model.now, {message: 'finishReframe', name: last.name, width: last.width, height: last.height});\n      \n      obj.addTransform(model.now, {message: 'reframe', transform: this.info.newTransform});\n    }\n  }\n\n  undo(model) {\n    let objects = model.objects;\n    if (this.type === 'clear') {\n      for (let k in this.info) {\n        objects.objects[k].to = this.info[k].oldTo;\n      }\n    } else if (this.type === 'addObject') {\n      objects.undoAddObject(this.info);\n    } else if (this.type === 'finishReframe') {\n      let obj = objects.objects[this.info.objectId].object;\n      obj.undo(model.now);\n    }\n  }\n}\n\n\n//# sourceURL=webpack:///./src/timeObject.js?");

/***/ }),

/***/ "./src/timeTest.js":
/*!*************************!*\
  !*** ./src/timeTest.js ***!
  \*************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _timeObject_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./timeObject.js */ \"./src/timeObject.js\");\n\n\nclass Interface {\n  newSegment(canvas, obj) {\n    console.log('segment:', obj);\n  }\n\n  clear(canvas) {\n    console.log('clear');\n  }\n}\n\nfunction load() {\n\n  let objects = new _timeObject_js__WEBPACK_IMPORTED_MODULE_0__[\"Objects\"]('abc');\n  window.objects = objects;\n\n  let s1 = new _timeObject_js__WEBPACK_IMPORTED_MODULE_0__[\"Stroke\"]('s1');\n\n  objects.add(0, [s1]);\n\n  console.log('get:', objects.get(0, 's1'));\n\n  s1.add(0, {stroke: 1});\n  s1.add(0, {stroke: 2});\n\n  s1.add(1, {stroke: 3});\n\n  objects.applyTo(null, 1, new Interface());\n\n  objects.applyTo(null, 0.5, new Interface());\n}\n\nwindow.onload = load;\n\n\n//# sourceURL=webpack:///./src/timeTest.js?");

/***/ })

/******/ });