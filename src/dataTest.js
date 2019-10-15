import {Cache, Command, CommandArray} from './data.js';

let cache = new Cache();
cache.resetFor({width: 100, height: 100});
window.cache = cache;

function add(commandArray, time, userId, command) {
  commandArray.add(time, userId, c(command));
}

function c(n) {
  return new Command('test', n);
}

function load() {
  let commandArray = new CommandArray(2);
  window.commandArray = commandArray;

  add(commandArray, 0.333, 'abc', {stroke: 1});
  add(commandArray, 0.666, 'abc', {stroke: 2});
  add(commandArray, 0.333, 'abc', {stroke: 3});

  add(commandArray, 0.111, 'abc', {stroke: 4});

  add(commandArray, 0.222, 'abc', {stroke: 5});
  add(commandArray, 0.888, 'abc', {stroke: 6});
  add(commandArray, 0.666, 'abc', {stroke: 7});
  add(commandArray, 0.777, 'abc', {stroke: 8});
  add(commandArray, 0.777, 'abc', {stroke: 9});

  commandArray.applyCommandsTo(null, 0.666, cache);
}

window.onload = load;
