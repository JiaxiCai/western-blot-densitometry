import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the shipped bundle's actual pointer handlers in a simulated DOM.
function launch() {
  class Element {
    constructor() {
      this.value = ''; this.checked = false; this.disabled = true; this.dataset = {}; this.style = {};
      this.options = []; this.children = []; this.listeners = {}; this.classList = { toggle() {} };
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    replaceChildren(...children) { this.children = children; this.options = children; }
    append(child) { this.children.push(child); }
    add(child) { this.options.push(child); }
    focus() {}
    emit(name, extra = {}) { this.listeners[name]?.({ target: this, preventDefault() {}, ...extra }); }
  }
  class Canvas extends Element {
    constructor() {
      super(); this.width = 720; this.height = 300;
      const self = this;
      this.context = {
        fillStyle: '#000000', data: null,
        ensure() { if (!this.data || this.data.length !== self.width * self.height * 4) this.data = new Uint8ClampedArray(self.width * self.height * 4); },
        fillRect(x, y, w, h) {
          this.ensure();
          const color = this.fillStyle === 'white' ? [255, 255, 255] : this.fillStyle.startsWith('#') ? [1, 3, 5].map(i => parseInt(this.fillStyle.slice(i, i + 2), 16)) : this.fillStyle.match(/\d+/g).map(Number);
          for (let yy = Math.max(0, Math.ceil(y)); yy < Math.min(self.height, y + h); yy++) for (let xx = Math.max(0, Math.ceil(x)); xx < Math.min(self.width, x + w); xx++) this.data.set([...color, 255], (yy * self.width + xx) * 4);
        },
        getImageData() { this.ensure(); return { data: this.data }; },
        putImageData(image) { this.data = image.data; },
        drawImage() {}, strokeRect() {}, setLineDash() {}, fillText() {}
      };
    }
    getContext() { return this.context; }
    getBoundingClientRect() { return { left: 10, top: 20, width: this.width / 2, height: this.height / 2 }; }
    setPointerCapture() {} hasPointerCapture() { return false; } releasePointerCapture() {}
  }
  const nodes = new Map();
  function node(id) { if (!nodes.has(id)) nodes.set(id, id === 'blot' ? new Canvas() : new Element()); return nodes.get(id); }
  node('lane').value = '1'; node('kind').value = 'target'; node('tool').value = 'draw';
  node('polarity').value = 'dark'; node('lock-size').checked = true;
  runInNewContext(readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'), {
    document: { getElementById: node, createElement: tag => tag === 'canvas' ? new Canvas() : new Element() },
    window: {}, Option: function(text, value) { this.text = text; this.value = value; },
    ImageData: class { constructor(data) { this.data = data; } },
    Uint8Array, Uint16Array, Uint8ClampedArray, Float64Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Map, Set,
    confirm: () => true
  });
  const canvas = node('blot');
  const pointer = (event, x, y) => canvas.emit(event, { button: 0, pointerId: 1, clientX: 10 + x / 2, clientY: 20 + y / 2 });
  function drag(x1, y1, x2 = x1, y2 = y1) { pointer('pointerdown', x1, y1); pointer('pointermove', x2, y2); pointer('pointerup', x2, y2); }
  node('demo').emit('click');
  return { node, canvas, drag };
}

test('draw first size, complete background, then add another locked-size band', () => {
  const { node, drag } = launch();
  drag(70, 70, 130, 94);
  assert.match(node('selected-info').textContent, /60 × 24/);
  drag(70, 120);
  assert.equal(node('lane').value, '2');
  assert.equal(node('results').children.length, 1);
  assert.equal(node('results').children[0].children[5].textContent, '216,000');
  drag(225, 70); drag(225, 120);
  assert.equal(node('lane').value, '3');
  assert.equal(node('results').children.length, 2);
  assert.match(node('selected-info').textContent, /60 × 24/);
});
test('move and resize existing boxes, recalculate measurements and reject overlap', () => {
  const { node, drag } = launch();
  drag(70, 70, 130, 94); drag(70, 120);
  drag(100, 82, 110, 82);
  assert.match(node('selected-info').textContent, /x=80, y=70/);
  assert.equal(node('results').children[0].children[5].textContent, '180,000');
  drag(140, 94, 150, 100);
  assert.match(node('selected-info').textContent, /70 × 30/);
  drag(115, 85, 115, 135);
  assert.match(node('message').textContent, /Background cannot overlap/);
  assert.match(node('selected-info').textContent, /x=80, y=70/);
});
test('unlocked boxes use independently drawn sizes; selected pair can be deleted', () => {
  const { node, drag, canvas } = launch();
  node('lock-size').checked = false; node('lock-size').emit('change');
  drag(70, 70, 130, 94); drag(70, 120, 120, 140);
  drag(225, 70, 275, 100); drag(225, 130, 265, 150);
  assert.match(node('selected-info').textContent, /40 × 20/);
  node('results').children[1].emit('click');
  canvas.emit('keydown', { key: 'ArrowRight', shiftKey: false });
  assert.match(node('selected-info').textContent, /x=226/);
  node('delete-selected').emit('click');
  assert.equal(node('results').children.length, 1);
});
