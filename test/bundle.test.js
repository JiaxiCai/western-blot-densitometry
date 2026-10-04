import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('downloadable classic bundle starts and enables image tools without module imports', () => {
  const nodes = new Map();
  function node(id) {
    if (!nodes.has(id)) nodes.set(id, {
      value: '', disabled: true, dataset: {}, options: [], listeners: {},
      getContext: () => ({}),
      addEventListener(name, cb) { this.listeners[name] = cb; },
      replaceChildren(...children) { this.options = children; },
      add(child) { this.options.push(child); }
    });
    return nodes.get(id);
  }
  const window = {};
  runInNewContext(readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8'), {
    document: { getElementById: node }, window,
    Option: function(text, value) { this.text = text; this.value = value; },
    Uint8Array, Uint16Array, Uint8ClampedArray, Float64Array, DataView,
    Map, Set, ArrayBuffer, TextDecoder, TextEncoder
  });
  assert.equal(window.densitometryReady, true);
  assert.equal(node('file').disabled, false);
  assert.equal(node('demo').disabled, false);
  assert.match(node('load-status').textContent, /Ready.*TIFF, JPEG, or PNG/);
  assert.equal(typeof node('file').listeners.change, 'function');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<script src="dist\/app.js"/);
  assert.doesNotMatch(html, /type="module"/);
});
