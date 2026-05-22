const canvas = document.getElementById("app");
const context = canvas.getContext("2d");
const text_decoder = new TextDecoder();
const text_encoder = new TextEncoder();

let buttons = [
  { A: false, B: false, UP: false, DOWN: false, LEFT: false, RIGHT: false, START: false },
  { A: false, B: false, UP: false, DOWN: false, LEFT: false, RIGHT: false, START: false },
];
let wasm_exports = null;

canvas.focus();
context.imageSmoothingEnabled = false;

WebAssembly.instantiateStreaming(fetch("main.wasm"), {
  js: {
    log: function(ptr, len) {
      const msg = decodeString(ptr, len);
      console.log(msg);
    },
    panic: function (ptr, len) {
      const msg = decodeString(ptr, len);
      throw new Error("panic: " + msg);
    },
    buttons: function (ptr, len) {
      const bytes = new Uint8Array(wasm_exports.memory.buffer, ptr, len);
      for (let i = 0; i < 2; i += 1) {
        bytes[8*i+0] = buttons[i].A;
        bytes[8*i+1] = buttons[i].B;
        bytes[8*i+2] = buttons[i].UP;
        bytes[8*i+3] = buttons[i].DOWN;
        bytes[8*i+4] = buttons[i].LEFT;
        bytes[8*i+5] = buttons[i].RIGHT;
        bytes[8*i+6] = buttons[i].START;
      }
    },
    fillText: function(ptr, len, size, x, y) {
      const msg = decodeString(ptr, len);
      context.font = size + "px serif";
      context.fillStyle = "white";
      context.fillText(msg, x, y);
    },
  },
}).then(function(obj) {
  wasm_exports = obj.instance.exports;
  window.wasm = obj; // for debugging

  // For testing in browser, hook up the keyboard. The listeners will never
  // fire on the real arcade cabinet.
  addBrowserListeners();
  addCabinetListeners();
  update();
});

function addBrowserListeners() {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

function removeBrowserListeners() {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('keyup', onKeyUp);
}

function onKeyDown(ev) {
  switch (ev.code) {
    case "KeyW": buttons[0].UP = true; return;
    case "KeyA": buttons[0].LEFT = true; return;
    case "KeyS": buttons[0].DOWN = true; return;
    case "KeyD": buttons[0].RIGHT = true; return;
    case "KeyF": buttons[0].A = true; return;
    case "KeyG": buttons[0].B = true; return;
    case "KeyI": buttons[1].UP = true; return;
    case "KeyJ": buttons[1].LEFT = true; return;
    case "KeyK": buttons[1].DOWN = true; return;
    case "KeyL": buttons[1].RIGHT = true; return;
    case "Semicolon": buttons[1].A = true; return;
    case "Quote": buttons[1].B = true; return;
    case "Digit1": buttons[0].START = true; return;
    case "Digit2": buttons[1].START = true; return;
  }
}

function onKeyUp(ev) {
  switch (ev.code) {
    case "KeyW": buttons[0].UP = false; return;
    case "KeyA": buttons[0].LEFT = false; return;
    case "KeyS": buttons[0].DOWN = false; return;
    case "KeyD": buttons[0].RIGHT = false; return;
    case "KeyF": buttons[0].A = false; return;
    case "KeyG": buttons[0].B = false; return;
    case "KeyI": buttons[1].UP = false; return;
    case "KeyJ": buttons[1].LEFT = false; return;
    case "KeyK": buttons[1].DOWN = false; return;
    case "KeyL": buttons[1].RIGHT = false; return;
    case "Semicolon": buttons[1].A = false; return;
    case "Quote": buttons[1].B = false; return;
    case "Digit1": buttons[0].START = false; return;
    case "Digit2": buttons[1].START = false; return;
  }
}

function addCabinetListeners() {
  const name = "@rcade/input-classic";
  const version = "^1.0.0";
  const nonce = Math.random().toString(36).substring(2, 15) +
                Math.random().toString(36).substring(2, 15);

  window.addEventListener('message', onMessage);
  window.parent.postMessage({
      type: "acquire_plugin_channel",
      nonce: nonce,
      channel: { name: name, version: version },
  }, "*");

  function onMessage(ev) {
    if (event.data.type !== 'plugin_channel' || event.data.nonce !== nonce) return;

    window.removeEventListener('message', onMessage);
    removeBrowserListeners(); // Arcade cabinet mode detected.

    if (event.data.error != null) throw new Error(event.data.error);

    event.ports[0].onmessage = onPortMsg;

    function onPortMsg(ev) {
      if (ev.data.type === "button") {
        buttons[ev.data.player - 1][ev.data.button] = ev.data.pressed;
      } else if (ev.data.type === "system") {
        if (ev.data.button === "ONE_PLAYER") {
          buttons[0].START = true;
        } else if (ev.data.button === "TWO_PLAYER") {
          buttons[1].START = true;
        }
      }
    };
  }
}

function update() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  wasm_exports.update();
  requestAnimationFrame(update);
}

function decodeString(ptr, len) {
  if (len === 0) return "";
  return text_decoder.decode(new Uint8Array(wasm_exports.memory.buffer, ptr, len));
}
