import test from 'node:test';
import assert from 'node:assert/strict';
import { detectBands } from '../src/detection.js';
function image(maxValue = 255, bright = false) {
  const width = 240, height = 140, pixels = new Uint16Array(width * height).fill(bright ? 0 : maxValue);
  const rects = [{ x: 30, y: 30, w: 30, h: 10 }, { x: 110, y: 32, w: 35, h: 12 }, { x: 30, y: 100, w: 30, h: 10 }];
  for (const r of rects) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) pixels[y * width + x] = bright ? Math.round(maxValue * 0.6) : Math.round(maxValue * 0.4);
  return { pixels, width, height, rects };
}
test('detect known dark rectangles and preserve native coordinates with padding', () => {
  const { pixels, width, height, rects } = image();
  const result = detectBands(pixels, width, height, { padding: 2, radius: 30 });
  assert.deepEqual(result.candidates, rects.map(r => ({ x: r.x - 2, y: r.y - 2, w: r.w + 4, h: r.h + 4 })));
  assert.equal(result.truncated, false);
});
test('bright and 16-bit detection produce the same boxes', () => {
  const a = image(), b = image(65535), c = image(65535, true);
  assert.deepEqual(detectBands(a.pixels, a.width, a.height).candidates, detectBands(b.pixels, b.width, b.height, { maxValue: 65535 }).candidates);
  assert.deepEqual(detectBands(b.pixels, b.width, b.height, { maxValue: 65535 }).candidates, detectBands(c.pixels, c.width, c.height, { maxValue: 65535, polarity: 'bright' }).candidates);
});
test('row limits, existing regions, size filters and candidate cap apply', () => {
  const { pixels, width, height, rects } = image();
  assert.equal(detectBands(pixels, width, height, { bottom: 70 }).candidates.length, 2);
  assert.equal(detectBands(pixels, width, height, { exclude: [rects[0]] }).candidates.length, 2);
  assert.equal(detectBands(pixels, width, height, { minWidth: 32 }).candidates.length, 1);
  const capped = detectBands(pixels, width, height, { limit: 1 });
  assert.equal(capped.candidates.length, 1); assert.equal(capped.truncated, true);
});
test('uniform images and isolated noise yield no bands; invalid settings reject', () => {
  const pixels = new Uint8Array(10000).fill(230); pixels[5050] = 0;
  assert.equal(detectBands(pixels, 100, 100).candidates.length, 0);
  for (const options of [{ contrast: 0 }, { radius: 0 }, { padding: -1 }, { top: 90, bottom: 80 }, { minWidth: 1.5 }]) assert.throws(() => detectBands(pixels, 100, 100, options));
});
test('padding stays within image and nearby but separated bands stay distinct', () => {
  const pixels = new Uint8Array(10000).fill(255);
  for (const x0 of [0, 25]) for (let y = 0; y < 8; y++) for (let x = x0; x < x0 + 20; x++) pixels[y * 100 + x] = 0;
  const { candidates } = detectBands(pixels, 100, 100, { radius: 30, padding: 2 });
  assert.equal(candidates.length, 2); assert.deepEqual(candidates[0], { x: 0, y: 0, w: 22, h: 10 });
});
