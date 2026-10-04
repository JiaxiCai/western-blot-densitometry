import test from 'node:test';
import assert from 'node:assert/strict';
import { imagePoint, drawnRect, positionedRect, movedRect, resizedRect, hitRegion, validateLayout, nextLane } from '../src/regions.js';

test('map display coordinates to image pixels, including a scaled canvas', () => {
  assert.deepEqual(imagePoint(60, 45, { left: 10, top: 20, width: 100, height: 50 }, 1000, 500), { x: 500, y: 250 });
});
test('free drawing supports either drag direction', () => {
  assert.deepEqual(drawnRect({ x: 100, y: 50 }, { x: 20, y: 10 }), { x: 20, y: 10, w: 80, h: 40 });
});
test('locked placement and movement preserve size and clamp at image edges', () => {
  assert.deepEqual(positionedRect({ x: 99, y: 99 }, { w: 20, h: 10 }, 100, 100), { x: 80, y: 90, w: 20, h: 10 });
  assert.deepEqual(movedRect({ x: 20, y: 30, w: 10, h: 10 }, { x: 25, y: 35 }, { x: 40, y: 50 }, 100, 100), { x: 35, y: 45, w: 10, h: 10 });
});
test('corner resize keeps the opposite corner fixed', () => {
  assert.deepEqual(resizedRect({ x: 20, y: 30, w: 40, h: 20 }, 'nw', { x: 10, y: 20 }, 100, 100), { x: 10, y: 20, w: 50, h: 30 });
});
test('selected corner handles take precedence; newest boxes are selected first', () => {
  const regions = [{ id: 1, part: 'band', rect: { x: 20, y: 20, w: 40, h: 20 } }, { id: 2, part: 'background', rect: { x: 40, y: 30, w: 40, h: 20 } }];
  assert.equal(hitRegion(regions, { x: 21, y: 21 }, { id: 1, part: 'band' }).corner, 'nw');
  assert.equal(hitRegion(regions, { x: 50, y: 35 }).id, 2);
});
test('validate all background boxes against all bands after an edit', () => {
  const m = { band: { x: 0, y: 0, w: 10, h: 10 }, background: { x: 20, y: 0, w: 10, h: 10 } };
  validateLayout([m]);
  assert.throws(() => validateLayout([m], { band: { x: 22, y: 0, w: 10, h: 10 } }), /Background/);
});
test('lane advance permits successive targets and controls with matching labels', () => {
  const m = [{ lane: '1', kind: 'target' }, { lane: '2', kind: 'target' }];
  assert.equal(nextLane('1', 'target', m), '3');
  assert.equal(nextLane('1', 'control', m), '2');
  assert.equal(nextLane('Sample A', 'target', []), 'Sample A (2)');
});
