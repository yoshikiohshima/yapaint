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
/******/ 	return __webpack_require__(__webpack_require__.s = "./src/dataTest.js");
/******/ })
/************************************************************************/
/******/ ({

/***/ "./src/data.js":
/*!*********************!*\
  !*** ./src/data.js ***!
  \*********************/
/*! exports provided: toKey, Cache, Bitmap, Command, CommandArray */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"toKey\", function() { return toKey; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Cache\", function() { return Cache; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Bitmap\", function() { return Bitmap; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Command\", function() { return Command; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"CommandArray\", function() { return CommandArray; });\n// it is logically array, and physically sparse.  All elements have to\n// be sortable, and the sort order has to be stable.  It is often the\n// case that many elements are added quickly.\n// there may be multiple users adding strokes simultaneously. Each chunk is organized by the userId, the user's more action are added to that\n\n\n// [unambigously quantized timecode] -> {userId: [commans]}\n\n// I assume that getCurrentTime() is stable, in the sense that if you seek to a position, the value is the same.\n// For debugging, it needs to quantize the value properly.\n\nfunction toKey(n) {\n  return Math.trunc(n * 1000);\n}\n\nclass Cache {\n  resetFor(canvas) {\n    this.cache = new Map();\n    this.set(toKey(-1), new ImageData(canvas.width, canvas.height).data);\n  }\n\n  set(key, object) {\n    this.cache.set(key, object);\n  }\n\n  get(key) {\n    return this.cache.get(key);\n  }\n\n  delete(key) {\n    return this.cache.delete(key);\n  }\n\n  findClosestBitmap(time, commandArray) {\n    // there should be always one\n    let timeKey = toKey(time);\n    let ind = commandArray.findClosestIndex(timeKey);\n    for (let i = ind; i >= 0; i--) {\n      let k = commandArray.keyAt(i);\n      let v = this.get(k);\n      if (v) {\n        return [i, v];\n      }\n    }\n    return [null, null]; // should not be reached\n  }\n}\n\nclass Bitmap {\n  constructor(id, name) {\n    this.name = name;\n    this.id = id;\n    this.keys = [];\n    this.data = new Map();\n    // this.data {x, y, width, height, userId}\n  }\n\n  addPosition(time, position) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = this.findIndexFor(timeKey, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.set(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push(position);\n  }\n\n  findLast(time) {\n    let timeKey = toKey(time);\n    let ind = this.findClosestIndex(timeKey);\n    let array = this.data.get(this.keys[ind]);\n    return array[array.length - 1];\n  }\n\n  undo() {\n    let lastKey = this.keys[this.keys.length - 1];\n    for (let k = this.keys.length - 1; k >= 0; k--) {\n      let array = this.data[this.keys[k]];\n      let key = this.keys[k];\n      let undo = array.pop();\n      if (array.length === 0) {\n        this.keys.splice(k, 1);\n        this.data.delete(key);\n      }\n      return undo;\n    }\n    return null; // should not reach\n  }\n\n  findIndexFor(timeKey, low, high) { // low is inclusive high is exclusive\n    if (high === low) {\n      return [low, true];\n    }\n\n    if (high - 1 === low) {\n      if (timeKey < this.keys[low]) {\n        return [low, true];\n      }\n      if (timeKey === this.keys[low]) {\n        return [low, false];\n      }\n      return [low + 1, true];\n    }\n\n    let mid = Math.floor((high + low) / 2);\n    if (timeKey < this.keys[mid]) {\n      return this.findIndexFor(timeKey, low, mid);\n    } else if (timeKey === this.keys[mid]) {\n      return [mid, false];\n    } else {\n      return this.findIndexFor(timeKey, mid, high);\n    }\n  }\n\n  findClosestIndex(timeKey) {\n    let [ind, notFound] = this.findIndexFor(timeKey, 0, this.keys.length);\n    return notFound ? ind - 1 : ind;\n  }\n}\n\nclass Command {\n  constructor(type, info) {\n    // type: 'stroke','finishStroke', 'addBitmap', 'removeBitmap', 'reframeBitmap',\n    //   beginStroke: {start: {x: y}, end: {x, y}, color: string, width, userId} color == 'transparent': erase\n    //   stroke: {start: {x: y}, end: {x, y}, color: string, width, userId}\n    //   finishStroke: {start: {x: y}, end: {x, y}, color: string, width, userId}\n    //   addBitmap: {bitmapName, x, y, id, userId}\n    //   removeBitmap: {id, userId}\n    //   reframeBitmap: {id, startx, starty, endx, endy, useerId}\n    //   showSelection: {id, userId}\n    //   hideSelection: {id, userId}\n    this.type = type;\n    this.info = info;\n  }\n\n  doOn(canvas, intf) {\n    if (this.type === 'test') {\n    } else if (this.type === 'beginStroke') {\n    } else if (this.type === 'stroke') {\n      intf.newSegment(canvas, this.info);\n    } else if (this.type === 'clear') {\n      intf.clear(canvas);\n    } else if (this.type === 'reframeBitmap') {\n      intf.drawBitmap(canvas, this.info);\n    }\n  }\n}\n\nclass CommandArray {\n  constructor(threshold) {\n    let m1 = toKey(-1);\n    this.keys = [m1];\n    this.data = new Map();\n    this.data.set(m1, []);\n    this.commandCount = 0;\n\n    // above are essential fields\n    \n    this.threshold = threshold || 128; // 1024\n    this.uncachedCount = 0;\n    this.willCacheWhenLeave = null;\n  }\n\n  getCommandCount() {\n    return this.commandCount;\n  }\n\n  applyCommandsTo(canvas, toTime, cache, intf) {\n    intf.clear(canvas);\n    let toTimeKey = toKey(toTime);\n    let [index, bitmap] = cache.findClosestBitmap(toTime, this);\n    this.applyBitmap(canvas, bitmap);\n\n    let i = index + 1;\n\n    while (true) {\n      if (i >= this.keys.length || this.keys[i] > toTimeKey) {break;}\n      let array = this.data.get(this.keys[i]);\n      array.forEach((c) => c.command.doOn(canvas, intf));\n      i = i + 1;\n    }\n  }\n\n  applyBitmap(canvas, bits) {\n    if (!canvas) {\n      console.log(\"apply: \", bits);\n      return;\n    }\n\n    canvas.getContext('2d').putImageData(new ImageData(bits, canvas.width, canvas.height), 0, 0);\n  }\n\n  add(time, userId, command) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = this.findIndexFor(timeKey, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push({command: command, userId: userId});\n\n    this.uncachedCount++;\n    this.commandCount++;\n    if (this.uncachedCount > this.threshold) {\n      this.willCacheWhenLeave = timeKey;\n      this.uncachedCount = 0;\n    }\n  }\n\n  cache(cache, time, value) {\n    let timeKey = toKey(time);\n    cache.set(timeKey, value);\n    this.uncachedCount = 0;\n  }\n\n  leave(time, canvas, cache) {\n    let timeKey = toKey(time);\n    if (this.willCacheWhenLeave === timeKey) {\n      this.willCacheWhenLeave = null;\n      if (cache.get(timeKey)) {\n        cache.delete(timeKey);\n      }\n      let bits = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;\n      cache.set(timeKey, bits);\n    }\n  }\n      \n  findIndexFor(timeKey, low, high) { // low is inclusive high is exclusive\n    if (high === low) {\n      return [low, true];\n    }\n\n    if (high - 1 === low) {\n      if (timeKey < this.keys[low]) {\n        return [low, true];\n      }\n      if (timeKey === this.keys[low]) {\n        return [low, false];\n      }\n      return [low + 1, true];\n    }\n\n    let mid = Math.floor((high + low) / 2);\n    if (timeKey < this.keys[mid]) {\n      return this.findIndexFor(timeKey, low, mid);\n    } else if (timeKey === this.keys[mid]) {\n      return [mid, false];\n    } else {\n      return this.findIndexFor(timeKey, mid, high);\n    }\n  }\n\n  findClosestIndex(timeKey) {\n    let [ind, notFound] = this.findIndexFor(timeKey, 0, this.keys.length);\n    return notFound ? ind - 1 : ind;\n  }\n\n  keyAt(ind) {\n    return this.keys[ind];\n  }\n\n  findLastUndoable(ind) {\n    for (let k = ind; k >= 0; k--) {\n      let array = this.data.get(this.keys[k]);\n      for (let i = array.length - 1; i >= 0; i--) {\n        let c = array[i];\n        if (c.command.type === 'finishStroke' || c.command.type === 'clear') {\n          return [k, i, c];\n        }\n      }\n    }\n    return [null, null, null];\n  }\n\n  getUndo(timeInd, arrayInd, command) {\n    if (command.command.type === 'clear') {\n      let array = this.data.get(this.keys[timeInd]);\n      array.splice(arrayInd, 1);\n      // if array size becomes zero...\n      this.commandCount--;\n      return [command];\n    }\n    if (command.command.type === 'finishStroke') {\n      let strokeId = command.command.info.strokeId;\n      let result = this.moveStrokeInto(timeInd, arrayInd, strokeId);\n      result.push(command);\n      this.commandCount -= result.length;\n      return result;\n    }\n  }\n\n  moveStrokeInto(timeInd, arrayInd, strokeId) {\n    let result = [];\n    for (let k = timeInd; k >= 0; k--) {\n      let array = this.data.get(this.keys[k]);\n      array.splice(arrayInd, 1);\n      let [undoArray, newArray] = this.splitArray(array, (c) => (c.command.type === 'stroke' || c.command.type === 'beginStroke') && c.command.info.strokeId === strokeId);\n      result = [...undoArray, ...result];\n      this.data.set(this.keys[k], newArray);\n      if (undoArray.findIndex((c) => c.command.type === 'beginStroke') >= 0) {\n        break;\n      }\n    }\n    return result;\n  }\n\n  splitArray(array, func) {\n    let t = [];\n    let f = [];\n    for (let i = 0; i < array.length; i++) {\n      let elem = array[i];\n      if (func(elem)) {\n        t.push(elem);\n      } else {\n        f.push(elem);\n      }\n    }\n    return [t, f];\n  }\n\n  undo(time) {\n    let timeKey = toKey(time);\n    let ind = this.findClosestIndex(timeKey);\n    let [timeInd, arrayInd, command] = this.findLastUndoable(ind);\n    if (!command) {return null;}\n    return this.getUndo(timeInd, arrayInd, command);\n  }\n}\n\n\n//# sourceURL=webpack:///./src/data.js?");

/***/ }),

/***/ "./src/dataTest.js":
/*!*************************!*\
  !*** ./src/dataTest.js ***!
  \*************************/
/*! no exports provided */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony import */ var _data_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! ./data.js */ \"./src/data.js\");\n\n\nlet cache = new _data_js__WEBPACK_IMPORTED_MODULE_0__[\"Cache\"]();\ncache.resetFor({width: 100, height: 100});\nwindow.cache = cache;\n\nfunction add(commandArray, time, userId, command) {\n  commandArray.add(time, userId, c(command));\n}\n\nclass Interface {\n  newSegment(canvas, obj) {\n    console.log('new segment');\n  }\n\n  clear(canvas) {\n    console.log('clear');\n  }\n\n  emptyImageData(width, height) {\n    return new ImageData(width, height).data;\n  }\n}\n\n\n\nfunction c(n) {\n  return new _data_js__WEBPACK_IMPORTED_MODULE_0__[\"Command\"]('test', n);\n}\n\nfunction load() {\n  let commandArray = new _data_js__WEBPACK_IMPORTED_MODULE_0__[\"CommandArray\"](2);\n  window.commandArray = commandArray;\n\n  add(commandArray, 0.333, 'abc', {stroke: 1});\n  add(commandArray, 0.666, 'abc', {stroke: 2});\n  add(commandArray, 0.333, 'abc', {stroke: 3});\n\n  add(commandArray, 0.111, 'abc', {stroke: 4});\n\n  add(commandArray, 0.222, 'abc', {stroke: 5});\n  add(commandArray, 0.888, 'abc', {stroke: 6});\n  add(commandArray, 0.666, 'abc', {stroke: 7});\n  add(commandArray, 0.777, 'abc', {stroke: 8});\n  add(commandArray, 0.777, 'abc', {stroke: 9});\n\n  commandArray.applyCommandsTo(null, 0.666, cache, new Interface());\n}\n\nwindow.onload = load;\n\n\n//# sourceURL=webpack:///./src/dataTest.js?");

/***/ })

/******/ });