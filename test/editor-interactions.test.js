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
  return { node, canvas, drag, pointer };
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
test('live plot previews dragging, restores on cancel, and updates normalized views', () => {
  const { node, drag, pointer, canvas } = launch();
  drag(70, 70, 130, 94); drag(70, 120);
  assert.match(node('plot').innerHTML, /Lane 1, target: 216000/);
  pointer('pointerdown', 100, 82); pointer('pointermove', 110, 82);
  assert.match(node('plot').innerHTML, /Lane 1, target: 180000/);
  assert.match(node('plot-status').textContent, /Preview/);
  canvas.emit('pointercancel');
  assert.match(node('plot').innerHTML, /Lane 1, target: 216000/);
  node('plot-mode').value = 'ratio'; node('plot-mode').emit('change');
  assert.match(node('plot').innerHTML, /target: unavailable/);
  node('kind').value = 'control'; node('kind').emit('change');
  drag(70, 210, 130, 234); drag(70, 250);
  assert.match(node('plot').innerHTML, /target: 2.142857142857143/);
  node('reference').value = '1'; node('reference').emit('change');
  node('plot-mode').value = 'relative'; node('plot-mode').emit('change');
  assert.match(node('plot').innerHTML, /Lane 1, target: 1/);
  assert.doesNotMatch(node('plot').innerHTML, /data-measurement-id="2"/);
});
test('user can select direct reference normalization without measuring controls', () => {
  const { node, drag } = launch();
  drag(70, 70, 130, 94); drag(70, 120);
  drag(225, 70); drag(225, 120);
  node('reference').value = '1'; node('reference').emit('change');
  node('plot-mode').value = 'relative'; node('plot-mode').emit('change');
  assert.match(node('plot').innerHTML, /target: unavailable/);
  node('normalization-method').value = 'direct'; node('normalization-method').emit('change');
  assert.equal(node('results').children[0].children[7].textContent, '1');
  assert.equal(node('results').children[1].children[7].textContent, '0.733');
  assert.equal(node('results').children[0].children[8].textContent, '-');
  assert.match(node('plot').innerHTML, /Direct target normalization/);
  assert.match(node('plot').innerHTML, /Lane 2, target: 0.7333333333333333/);
  node('normalization-method').value = 'control'; node('normalization-method').emit('change');
  assert.equal(node('reference').value, '1');
  assert.equal(node('results').children[0].children[7].textContent, '-');
  assert.match(node('plot').innerHTML, /Loading-control normalization/);
});
test('numeric sizes, row alignment, equal spacing and persistent alignment work in the app', () => {
  const { node, drag } = launch();
  drag(70, 70, 130, 94); drag(70, 140);
  drag(225, 80); drag(225, 140);
  drag(400, 60); drag(400, 140);
  node('batch-kind').value = 'target';
  node('results').children[0].emit('click');
  node('align-lock').checked = true; node('align-lock').emit('change');
  node('results').children[1].emit('click');
  assert.match(node('selected-info').textContent, /y=70/);
  node('batch-w').value = '50'; node('batch-h').value = '20'; node('apply-size-all').emit('click');
  assert.ok(node('results').children.every(tr => tr.children[2].textContent === 1000));
  node('distribute-bands').emit('click');
  assert.match(node('selected-info').textContent, /x=235, y=70/);
  drag(260, 80, 260, 90);
  node('results').children[0].emit('click');
  assert.match(node('selected-info').textContent, /y=80/);
  node('selected-w').value = '40'; node('selected-h').value = '18'; node('apply-size-selected').emit('click');
  assert.match(node('selected-info').textContent, /40 × 18/);
  assert.equal(node('results').children[0].children[2].textContent, 720);
  // The first box drawn in a locked row snaps to that row, independent of draw Y.
  drag(560, 40); drag(560, 140);
  node('results').children[3].emit('click');
  assert.match(node('selected-info').textContent, /y=80/);
});

test('automatic backgrounds complete bands and remember manual movement for subsequent bands', () => {
  const { node, drag } = launch();
  node('background-placement').value = 'above'; node('background-gap').value = '5'; node('remember-background').checked = true;
  drag(70, 70, 130, 94);
  assert.equal(node('results').children.length, 1);
  assert.equal(node('lane').value, '2');
  drag(100, 53, 110, 48);
  assert.match(node('selected-info').textContent, /x=80, y=36/);
  assert.equal(node('background-placement').value, 'remember');
  drag(225, 70);
  assert.equal(node('results').children.length, 2);
  drag(260, 48);
  assert.match(node('selected-info').textContent, /x=235, y=36.*60 × 24/);
  // Moving the band remains independent of its existing background.
  drag(255, 82, 260, 82);
  drag(260, 48);
  assert.match(node('selected-info').textContent, /x=235, y=36/);
});
test('failed automatic placement keeps pending band and can be retried below', () => {
  const { node, drag } = launch();
  node('background-placement').value = 'above'; node('background-gap').value = '5';
  drag(70, 5, 130, 29);
  assert.equal(node('results').children.length, 0);
  assert.match(node('message').textContent, /Automatic background could not be placed/);
  assert.match(node('selected-info').textContent, /x=70, y=5/);
  node('background-placement').value = 'below'; node('place-background').emit('click');
  assert.equal(node('results').children.length, 1);
  drag(100, 46);
  assert.match(node('selected-info').textContent, /x=70, y=34.*60 × 24/);
});
test('replace selected background and explicitly reuse offset; remembering can be disabled', () => {
  const { node, drag } = launch();
  drag(70, 70, 130, 94); drag(70, 120);
  node('background-placement').value = 'below'; node('background-gap').value = '5';
  node('place-background').emit('click');
  assert.match(node('selected-info').textContent, /x=70, y=99/);
  drag(100, 111, 110, 116);
  assert.equal(node('background-placement').value, 'below');
  node('use-background-offset').emit('click');
  assert.equal(node('background-placement').value, 'remember');
  assert.equal(node('remember-background').checked, true);
  node('draw-new-size').emit('click');
  drag(225, 70, 275, 100);
  drag(260, 120);
  assert.match(node('selected-info').textContent, /x=235, y=110.*50 × 30/);
  node('background-placement').value = 'manual';
  drag(400, 70);
  assert.equal(node('results').children.length, 2);
  drag(400, 140);
  assert.equal(node('results').children.length, 3);
});

test('detector previews candidates without measuring, edits and accepts with backgrounds', () => {
  const { node, drag } = launch();
  for (const [id, value] of Object.entries({ 'detect-contrast': 8, 'detect-radius': 60, 'detect-min-w': 12, 'detect-min-h': 3, 'detect-max-h': 60, 'detect-padding': 0, 'detect-top': 0, 'detect-bottom': 150 })) node(id).value = String(value);
  node('detect-bands').emit('click');
  assert.equal(node('candidates').children.length, 4);
  assert.equal(node('results').children.length, 0);
  const row = node('candidates').children[0];
  assert.equal(row.children[1].children[0].value, 70);
  const xInput = row.children[1].children[0]; xInput.value = '71'; xInput.emit('change');
  node('background-placement').value = 'above'; node('background-gap').value = '5';
  row.children[5].children[0].emit('click');
  assert.equal(node('results').children.length, 1);
  assert.equal(node('candidates').children.length, 3);
  assert.match(node('selected-info').textContent, /x=71, y=70.*60 × 24/);
  drag(100, 82, 102, 82);
  assert.match(node('selected-info').textContent, /x=73/);
  node('detect-bands').emit('click');
  assert.equal(node('candidates').children.length, 3);
  node('candidates').children[0].children[5].children[1].emit('click');
  assert.equal(node('candidates').children.length, 2);
  node('clear-candidates').emit('click');
  assert.equal(node('candidates').children.length, 0);
  assert.equal(node('results').children.length, 1);
});
test('accepted detection candidate can await manual background and blocks further acceptance', () => {
  const { node, drag } = launch();
  for (const [id, value] of Object.entries({ 'detect-contrast': 8, 'detect-radius': 60, 'detect-min-w': 12, 'detect-min-h': 3, 'detect-max-h': 60, 'detect-padding': 0, 'detect-top': 0, 'detect-bottom': 150 })) node(id).value = String(value);
  node('detect-bands').emit('click');
  node('candidates').children[0].children[5].children[0].emit('click');
  assert.equal(node('results').children.length, 0);
  node('candidates').children[0].children[5].children[0].emit('click');
  assert.equal(node('candidates').children.length, 3);
  assert.match(node('message').textContent, /pending background/);
  drag(70, 120);
  assert.equal(node('results').children.length, 1);
  node('polarity').value = 'bright'; node('polarity').emit('change');
  assert.equal(node('candidates').children.length, 0);
});
