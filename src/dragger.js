let currentDocCapture;

class DocMouseCapture {
  static capture(move, up) {
    currentDocCapture = new DocMouseCapture(move, up);
  }
  
  constructor(move, up) {
    this.move = move;
    this.up = up;

    this.mouseMove = (evt) => this.docMouseMove(evt);
    this.mouseUp = (evt) => this.docMouseUp(evt);
    if (currentDocCapture && move) {
      console.error("we don't support multi touch");
      return;
    }

    document.addEventListener("mousemove", this.mouseMove);
    document.addEventListener("touchmove", this.mouseMove);
    document.addEventListener("mouseup", this.mouseUp);
    document.addEventListener("touchend", this.mouseUp);
  }

  docMouseMove(evt) {
    if (!this.move) {return;}
    this.move(evt);
  }

  docMouseUp(evt) {
    if (!this.up) {return;}
    this.up(evt);
    document.removeEventListener("mousemove", this.mouseMove);
    document.removeEventListener("mouseup", this.mouseUp);
    document.removeEventListener("touchmove", this.mouseMove);
    document.removeEventListener("touchend", this.mouseUp);
    currentDocCapture = null;
  }
}

export function dragger(callback, id) {
  let clickState;
  let updater = (obj) => {if (callback) {callback(obj);};};

  function mouseDown(evt) {
    let target = evt.target;
    evt.preventDefault();

    let left = target.style.getPropertyValue("left");
    left = left === "" ? 0 : parseInt(left, 10);
    let top = target.style.getPropertyValue("top");
    top = top === "" ? 0 : parseInt(top, 10);
    clickState = {origX: left, origY: top,
                  pageX: evt.pageX, pageY: evt.pageY,
                  left: left, top: top};
    DocMouseCapture.capture(mouseMove, mouseUp);
    updater({message: 'down', target: evt.target, id: id,
             touches: evt.touches,
             screenX: evt.screenX, screenY: evt.screenY});
  }

  function mouseMove(evt) {
    if (!clickState) {return;}
    evt.preventDefault();
    updater({message: 'move', target: evt.target, id: id,
             touches: evt.touches,
             screenX: evt.screenX, screenY: evt.screenY});
  }

  function mouseUp(evt) {
    evt.preventDefault();
    updater({message: 'up', target: evt.target, id: id,
             touches: evt.touches,
             screenX: evt.screenX, screenY: evt.screenY});
  }
  return mouseDown;
}
