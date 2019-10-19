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
/*! exports provided: toKey, Bitmap, Stroke, Objects, Action */
/***/ (function(module, __webpack_exports__, __webpack_require__) {

"use strict";
eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"toKey\", function() { return toKey; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Bitmap\", function() { return Bitmap; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Stroke\", function() { return Stroke; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Objects\", function() { return Objects; });\n/* harmony export (binding) */ __webpack_require__.d(__webpack_exports__, \"Action\", function() { return Action; });\nfunction toKey(n) {\n  return Math.trunc(n * 1000);\n}\n\nfunction findIndexFor(timeKey, obj, low, high) { // low is inclusive high is exclusive\n  if (high === low) {\n    return [low, true];\n  }\n\n  if (high - 1 === low) {\n    if (timeKey < obj.keys[low]) {\n      return [low, true];\n    }\n    if (timeKey === obj.keys[low]) {\n      return [low, false];\n    }\n    return [low + 1, true];\n  }\n\n  let mid = Math.floor((high + low) / 2);\n  if (timeKey < obj.keys[mid]) {\n    return findIndexFor(timeKey, obj, low, mid);\n  } else if (timeKey === obj.keys[mid]) {\n    return [mid, false];\n  } else {\n    return findIndexFor(timeKey, obj, mid, high);\n  }\n}\n\nfunction findClosestIndex(timeKey, obj) {\n  let [ind, notFound] = findIndexFor(timeKey, obj, 0, obj.keys.length);\n  return notFound ? ind - 1 : ind;\n}\n\nfunction findLast(time, obj) {\n  let timeKey = toKey(time);\n  let ind = findClosestIndex(timeKey, obj);\n  let array = obj.data.get(obj.keys[ind]);\n  return array[array.length - 1];\n}\n\nclass Bitmap {\n  constructor(id, name) {\n    this.name = name; // file name\n    this.id = id;\n    this.keys = [];\n    this.data = new Map();\n    // this.data {x, y, width, height, userId}\n  }\n\n  add(time, position) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push(position);\n  }\n\n  last(time) {\n    return findLast(time, this);\n  }\n\n  applyTo(canvas, toTime, intf) {\n    let timeKey = toKey(toTime);\n    let endIndex = findClosestIndex(timeKey, this);\n    for (let i = endIndex; i >= 0; i--) {\n      let array = this.data.get(this.keys[i]);\n      if (array.length > 0) {\n        let info = array[array.length - 1];\n        intf.drawBitmap(canvas, this.name, info);\n        return;\n      }\n    }\n  }\n\n  undo() {\n    if (this.keys.length === 0) {return null;}\n\n    let key = this.keys[this.keys.length - 1];\n    let array = this.data.get(key);\n    let last = array[array.length - 1];\n    if (last.message === 'addBitmap') {\n      array.pop();\n      return [last];\n    }\n\n    if (last.message === 'reframeBitmap') {\n      for (let i = this.keys.length - 1; i >= 0; i--) {\n        let e;\n        let ind;\n        let key = this.keys[i]\n        let array = this.data.get(key);\n        for (ind = array.length - 1; ind >= 0; ind--) {\n          e = array[ind];\n          if (e.message !== 'select' && e.message !== 'reframeBitmap') {\n            break;\n          }\n        }\n        if (ind < 0) {\n          this.data.delete(key);\n          this.keys.splice(i);\n        } else {\n          array.splice(ind + 1);\n          return;\n        }\n      }\n    }\n  }\n}\n\nclass Stroke {\n  constructor(id) {\n    this.id = id;\n    this.keys = [];\n    this.data = new Map();\n    // this.data {x0, y0, x1, y1, width, color, userId}\n  }\n\n  add(time, newSegment) {\n    let timeKey = toKey(time);\n    let [ind, toAdd] = findIndexFor(timeKey, this, 0, this.keys.length);\n    if (toAdd) {\n      this.keys.splice(ind, 0, timeKey);\n    }\n    \n    let array = this.data.get(timeKey);\n    if (!array) {\n      array = [];\n      this.data.set(timeKey, array);\n    }\n    array.push(newSegment);\n  }\n\n  last(time) {\n    return findLast(time, this);\n  }\n\n  applyTo(canvas, toTime, intf) {\n    let timeKey = toKey(toTime);\n    let endIndex = findClosestIndex(timeKey, this);\n    for (let i = 0; i <= endIndex; i++) {\n      let array = this.data.get(this.keys[i]);\n      array.forEach((segment) => intf.newSegment(canvas, segment));\n    }\n  }\n\n  undo() {\n    if (this.keys.length === 0) {return null;}\n    let array = this.data[this.keys[0]];\n    return array[0];\n  }\n}\n\nclass Objects {\n  constructor(id) {\n    this.id = id;\n    this.objects = {}; // {id: {object: object, from: fromTimeKey, to: toTimeKey | undefined}\n  }\n\n  addObject(time, obj) {\n    this.objects[obj.id] = {object: obj, from: toKey(time)};\n  }\n\n  undoAddObject(object) {\n    let obj = this.objects[object.id].object;\n    delete this.objects[object.id];\n    return obj;\n  }\n\n  get(time, objectId) {\n    let timeKey = toKey(time);\n    let info = this.objects[objectId];\n    if (info.from <= timeKey &&\n        (info.to === undefined || timeKey < info.to)) {\n      return info.object;\n    }\n    return null;\n  }\n\n  liveObjectsDo(time, func) {\n    let timeKey = toKey(time);\n\n    for (let k in this.objects) {\n      let obj = this.get(time, k);\n      if (obj) {\n        func(obj);\n      }\n    }\n  }\n\n  undo(id, time) {\n    let obj = this.get(time, id);\n    return obj.undo();\n  }\n\n  killObjects(time) {\n    let timeKey = toKey(time);\n    let undo = {};\n    this.liveObjectsDo(time, (obj) => {\n      undo[obj.id] = {oldTo: this.objects[obj.id].to, newTo: timeKey};\n      this.objects[obj.id].to = timeKey;\n    });\n    return undo;\n  }\n\n  applyTo(canvas, time, intf) {\n    intf.clear(canvas);\n    this.liveObjectsDo(time, (obj) => obj.applyTo(canvas, time, intf));\n  }\n}\n\nclass Action {\n  constructor(type, info) {\n    this.type = type;\n    this.info = info;\n  }\n\n  redo(model) {\n    let objects = model.objects;\n    if (this.type === 'clear') {\n      for (let k in this.info) {\n        objects.objects[k].to = this.info[k].newTo;\n      }\n    } else if (this.type === 'addObject') {\n      objects.addObject(model.now, this.info);\n    } else if (this.type === 'finishReframeBitmap') {\n      let bitmap = objects.objects[this.info.objectId].object;\n      bitmap.add(model.now, this.info);\n    }\n  }\n\n  undo(model) {\n    let objects = model.objects;\n    if (this.type === 'clear') {\n      for (let k in this.info) {\n        objects.objects[k].to = this.info[k].oldTo;\n      }\n    } else if (this.type === 'addObject') {\n      objects.undoAddObject(this.info);\n    } else if (this.type === 'finishReframeBitmap') {\n      let bitmap = objects.objects[this.info.objectId].object;\n      bitmap.undo();\n    }\n  }\n}\n\n\n//# sourceURL=webpack:///./src/timeObject.js?");

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