import test from 'node:test';
import assert from 'node:assert/strict';
import { arrangeBands, editBox } from '../src/bulk-regions.js';

const measurements = [
  { id: 1, kind: 'target', lane: '1', band: { x: 10, y: 20, w: 20, h: 10 }, background: { x: 10, y: 150, w: 20, h: 10 } },
  { id: 2, kind: 'target', lane: '2', band: { x: 80, y: 40, w: 20, h: 10 }, background: { x: 80, y: 150, w: 20, h: 10 } },
  { id: 3, kind: 'target', lane: '3', band: { x: 260, y: 60, w: 20, h: 10 }, background: { x: 260, y: 150, w: 20, h: 10 } },
  { id: 4, kind: 'control', lane: '1', band: { x: 10, y: 100, w: 20, h: 10 }, background: { x: 10, y: 200, w: 20, h: 10 } }
];
test('align selected group to selected band or exact Y while other rows stay fixed', () => {
  const result = arrangeBands(measurements, 'target', 'align', { anchorId: 2 }, 400, 400);
  assert.deepEqual(result.slice(0, 3).map(m => m.band.y), [40, 40, 40]);
  assert.equal(result[3].band.y, 100); assert.equal(result[0].background.y, 150);
  const both = arrangeBands(measurements, 'all', 'align', { anchorId: 2 }, 400, 400);
  assert.equal(both[3].band.y, 100);
  assert.equal(arrangeBands(measurements, 'target', 'align', { y: 30 }, 400, 400)[0].band.y, 30);
  const numericBoth = arrangeBands(measurements, 'all', 'align', { y: 30, anchorId: 2 }, 400, 400);
  assert.equal(numericBoth[0].band.y, 30); assert.equal(numericBoth[3].band.y, 90);
});
test('distribute centers equally, preserving endpoints and left-to-right order', () => {
  const result = arrangeBands(measurements, 'target', 'distribute', {}, 400, 400);
  assert.deepEqual(result.slice(0, 3).map(m => m.band.x), [10, 135, 260]);
  assert.deepEqual(result.slice(0, 3).map(m => m.band.y), [20, 40, 60]);
  assert.equal(result[3].band.x, 10);
});
test('group size preserves positions; paired backgrounds are resized only when chosen', () => {
  const result = arrangeBands(measurements, 'all', 'size', { w: 40, h: 20 }, 400, 400);
  assert.ok(result.every(m => m.band.w === 40 && m.band.h === 20));
  assert.deepEqual(result.map(m => m.band.x), measurements.map(m => m.band.x));
  assert.equal(result[0].background.w, 20);
  const withBg = arrangeBands(measurements, 'target', 'size', { w: 30, h: 20, backgrounds: true }, 400, 400);
  assert.equal(withBg[0].background.w, 30); assert.equal(withBg[3].background.w, 20);
});
test('locked row moves together, including edits to an incomplete band', () => {
  const result = editBox(measurements, null, 1, 'band', { ...measurements[0].band, y: 30 }, { target: 20, control: null }, 400, 400);
  assert.deepEqual(result.measurements.slice(0, 3).map(m => m.band.y), [30, 30, 30]);
  assert.equal(result.alignment.target, 30);
  const pending = { id: 5, kind: 'target', band: { x: 340, y: 30, w: 20, h: 10 } };
  const next = editBox(result.measurements, pending, 5, 'band', { ...pending.band, y: 45 }, result.alignment, 400, 400);
  assert.equal(next.pending.band.y, 45); assert.equal(next.measurements[0].band.y, 45);
});
test('invalid group edits are rejected without mutating inputs', () => {
  const snapshot = JSON.stringify(measurements);
  assert.throws(() => arrangeBands(measurements, 'target', 'align', { y: 150 }, 400, 400), /Background/);
  assert.throws(() => arrangeBands(measurements, 'target', 'size', { w: 200, h: 20 }, 400, 400), /outside/);
  assert.throws(() => arrangeBands(measurements, 'target', 'size', { w: 0, h: 20 }, 400, 400), /outside/);
  assert.equal(JSON.stringify(measurements), snapshot);
});
