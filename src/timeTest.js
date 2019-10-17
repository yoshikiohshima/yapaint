import {Objects, Stroke, Bitmap} from './timeObject.js';

class Interface {
  newSegment(canvas, obj) {
    console.log('segment:', obj);
  }

  clear(canvas) {
    console.log('clear');
  }
}

function load() {

  let objects = new Objects('abc');
  window.objects = objects;

  let s1 = new Stroke('s1');

  objects.add(0, [s1]);

  console.log('get:', objects.get(0, 's1'));

  s1.add(0, {stroke: 1});
  s1.add(0, {stroke: 2});

  s1.add(1, {stroke: 3});

  objects.applyTo(null, 1, new Interface());

  objects.applyTo(null, 0.5, new Interface());
}

window.onload = load;
