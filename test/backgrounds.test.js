import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundForBand, offsetFromPair } from '../src/backgrounds.js';
import { validateRectangles } from '../src/bulk-regions.js';
const band = { x: 70, y: 70, w: 60, h: 24 };
test('same-size backgrounds above and below preserve the specified gap', () => {
  assert.deepEqual(backgroundForBand(band, { side: 'above', gap: 5, dx: 0 }), { x: 70, y: 41, w: 60, h: 24 });
  assert.deepEqual(backgroundForBand(band, { side: 'below', gap: 5, dx: 0 }), { x: 70, y: 99, w: 60, h: 24 });
});
test('learned above/below positions preserve gaps for differently sized bands', () => {
  const offset = offsetFromPair(band, { x: 80, y: 36, w: 60, h: 24 });
  assert.deepEqual(offset, { side: 'above', gap: 10, dx: 10 });
  assert.deepEqual(backgroundForBand({ x: 225, y: 70, w: 50, h: 30 }, offset), { x: 235, y: 30, w: 50, h: 30 });
  assert.deepEqual(offsetFromPair(band, { x: 65, y: 104, w: 60, h: 24 }), { side: 'below', gap: 10, dx: -5 });
});
test('sideways backgrounds remember X/Y offset while adopting the new band size', () => {
  const offset = offsetFromPair(band, { x: 140, y: 75, w: 60, h: 24 });
  assert.deepEqual(offset, { side: 'offset', dx: 70, dy: 5 });
  assert.deepEqual(backgroundForBand({ ...band, w: 50, h: 20 }, offset), { x: 140, y: 75, w: 50, h: 20 });
});
test('automatic backgrounds reject invalid gaps, out-of-bounds and cross-band overlap', () => {
  for (const gap of [-1, 1.5, NaN]) assert.throws(() => backgroundForBand(band, { side: 'above', gap, dx: 0 }), /whole pixels/);
  const pair = { id: 1, kind: 'target', lane: '1', band, background: backgroundForBand(band, { side: 'above', gap: 50, dx: 0 }) };
  assert.throws(() => validateRectangles([pair], null, 720, 300));
  pair.background = backgroundForBand(band, { side: 'below', gap: 5, dx: 0 });
  const other = { id: 2, kind: 'control', lane: '1', band: { x: 70, y: 110, w: 60, h: 24 }, background: { x: 70, y: 160, w: 60, h: 24 } };
  assert.throws(() => validateRectangles([pair, other], null, 720, 300), /Background cannot overlap/);
});
