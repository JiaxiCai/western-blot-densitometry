import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeTiff, detectFormat, toGrayscale, displayRGBA } from '../src/image-input.js';
import { quantify } from '../src/analysis.js';

const fixtures = JSON.parse(readFileSync(new URL('./tiff-fixtures.json', import.meta.url)));
for (const fixture of fixtures.filter(f => !['float32', 'eight_packbits'].includes(f.name))) {
  test(`decode known TIFF values: ${fixture.name}`, () => {
    const bytes = Uint8Array.from(Buffer.from(fixture.base64, 'base64'));
    assert.equal(detectFormat(bytes.buffer), 'TIFF');
    const decoded = decodeTiff(bytes.buffer);
    assert.equal(decoded.width, 3); assert.equal(decoded.height, 2);
    assert.deepEqual(Array.from(decoded.pixels), fixture.expected);
    assert.equal(decoded.bitDepth, fixture.name.startsWith('eight') ? 8 : 16);
    assert.equal(decoded.pages, fixture.name === 'multipage' ? 2 : 1);
  });
}
test('16-bit measurements retain differences lost in an 8-bit preview', () => {
  const pixels = Uint16Array.from([40000, 40001, 50000]);
  const r = quantify(pixels, 3, 1, { x: 0, y: 0, w: 2, h: 1 }, { x: 2, y: 0, w: 1, h: 1 }, 'dark', 65535);
  assert.equal(r.corrected, 19999);
  const before = Array.from(pixels); displayRGBA(pixels, 65535, true);
  assert.deepEqual(Array.from(pixels), before);
});
test('reject floating-point TIFF with a clear message', () => {
  const fixture = fixtures.find(f => f.name === 'float32');
  assert.throws(() => decodeTiff(Uint8Array.from(Buffer.from(fixture.base64, 'base64')).buffer), /unsigned 8-bit or 16-bit/);
});
test('report unsupported TIFF compression instead of silently failing', () => {
  const fixture = fixtures.find(f => f.name === 'eight_packbits');
  assert.throws(() => decodeTiff(Uint8Array.from(Buffer.from(fixture.base64, 'base64')).buffer), /PackBits/);
});
test('recognize PNG/JPEG bytes rather than relying on filenames', () => {
  assert.equal(detectFormat(Uint8Array.from([255, 216, 255, 224]).buffer), 'JPEG');
  assert.equal(detectFormat(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]).buffer), 'PNG');
  assert.throws(() => detectFormat(new ArrayBuffer(0)), /Choose a PNG/);
});
test('convert RGB to weighted grayscale and preserve achromatic values', () => {
  const r = toGrayscale(Uint8Array.from([255, 0, 0, 255, 128, 128, 128, 255]), 2, 1, 4, 255);
  assert.equal(r.pixels[0], 54.213); assert.equal(r.pixels[1], 128); assert.equal(r.hasColor, true);
  assert.throws(() => toGrayscale(Uint8Array.from([1, 1, 1, 0]), 1, 1, 4, 255), /Transparent/);
});
