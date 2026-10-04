import test from 'node:test';
import assert from 'node:assert/strict';
import { quantify, measure, normalize, normalizeWithReference, csvCell } from '../src/analysis.js';

test('dark band subtraction uses background mean scaled by band area', () => {
  const pixels = Uint8Array.from([50, 50, 200, 200, 50, 50, 200, 200]);
  const r = quantify(pixels, 4, 2, { x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 1, h: 2 }, 'dark');
  assert.equal(r.sum, 820);
  assert.equal(r.backgroundMean, 55);
  assert.equal(r.corrected, 600);
});
test('bright signals and negative corrected values remain measurable', () => {
  const r = quantify(Uint8Array.from([10, 20]), 2, 1, { x: 0, y: 0, w: 1, h: 1 }, { x: 1, y: 0, w: 1, h: 1 }, 'bright');
  assert.equal(r.corrected, -10);
});
test('reject overlap and empty regions', () => {
  const rect = { x: 0, y: 0, w: 1, h: 1 };
  assert.throws(() => quantify(Uint8Array.from([100]), 1, 1, rect, rect, 'dark'), /overlap/);
  assert.throws(() => measure(Uint8Array.from([100]), 1, 1, { ...rect, w: 0 }), /pixels/);
});
test('count clipped pixels at signal endpoint', () => {
  assert.equal(measure(Uint8Array.from([0, 255]), 2, 1, { x: 0, y: 0, w: 2, h: 1 }, 'dark').clipped, 1);
});
test('normalize to control and reference; reject nonpositive corrected signals', () => {
  assert.deepEqual(normalize(200, 100, 4), { ratio: 2, relative: 0.5 });
  assert.deepEqual(normalize(200, 0, 4), { ratio: null, relative: null });
  assert.deepEqual(normalize(-10, 20, 4), { ratio: null, relative: null });
});
test('escape CSV labels and formula-like text', () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell(-10), '"-10"');
});
test('direct reference normalization works without loading controls', () => {
  assert.deepEqual(normalizeWithReference(200, undefined, 100, undefined, 'direct'), { ratio: null, relative: 2 });
  assert.deepEqual(normalizeWithReference(100, undefined, 100, undefined, 'direct'), { ratio: null, relative: 1 });
});
test('switching reference methods uses the appropriate numerator and denominator', () => {
  assert.deepEqual(normalizeWithReference(200, 100, 100, 50, 'control'), { ratio: 2, relative: 1 });
  assert.deepEqual(normalizeWithReference(200, 100, 100, 50, 'direct'), { ratio: 2, relative: 2 });
});
test('reference normalization rejects missing or nonpositive required signals', () => {
  for (const reference of [undefined, 0, -10]) assert.equal(normalizeWithReference(200, undefined, reference, undefined, 'direct').relative, null);
  assert.equal(normalizeWithReference(-10, undefined, 100, undefined, 'direct').relative, null);
  assert.equal(normalizeWithReference(200, undefined, 100, 50, 'control').relative, null);
});
