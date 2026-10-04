import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlot } from '../src/plot.js';

const rows = [
  { id: 1, lane: '1', kind: 'target', corrected: 200, ratio: 2, relative: 1, flags: '' },
  { id: 2, lane: '1', kind: 'control', corrected: 100, ratio: null, relative: null, flags: '' },
  { id: 3, lane: '2', kind: 'target', corrected: -50, ratio: null, relative: null, flags: 'Nonpositive signal' }
];
test('corrected plot includes target and control values, including negatives', () => {
  const plot = buildPlot(rows, 'corrected', 1);
  assert.equal(plot.count, 3); assert.equal(plot.missing, 0);
  assert.match(plot.svg, /Lane 2, target: -50/);
  assert.match(plot.svg, /stroke-width="3"/);
  assert.doesNotMatch(plot.svg, /NaN|Infinity/);
});
test('ratio plot shows only targets and marks unavailable values without zero bars', () => {
  const plot = buildPlot(rows, 'ratio');
  assert.equal(plot.count, 1); assert.equal(plot.missing, 1);
  assert.doesNotMatch(plot.svg, /data-measurement-id="2"/);
  assert.match(plot.svg, /Lane 2, target: unavailable/);
  assert.match(plot.svg, />NA<\/text>/);
});
test('relative plot displays reference=1 and exports editable text', () => {
  const plot = buildPlot(rows, 'relative');
  assert.match(plot.svg, /reference = 1/);
  assert.match(plot.svg, /stroke-dasharray="5 4"/);
  assert.match(plot.svg, /font-family="Arial/);
  assert.match(plot.svg, /<text /);
});
test('empty, all-zero and all-unavailable plots have finite geometry', () => {
  assert.equal(buildPlot([]).svg, '');
  for (const plot of [buildPlot([{ ...rows[0], corrected: 0 }]), buildPlot([{ ...rows[0], ratio: null }], 'ratio')]) assert.doesNotMatch(plot.svg, /NaN|Infinity/);
});
test('escape lane labels so they cannot insert SVG markup', () => {
  const plot = buildPlot([{ ...rows[0], lane: '<script>&"' }]);
  assert.doesNotMatch(plot.svg, /<script>/);
  assert.match(plot.svg, /&lt;script&gt;&amp;&quot;/);
});
test('relative plot and SVG export identify direct normalization and its reference', () => {
  const plot = buildPlot(rows, 'relative', null, { referenceMethod: 'direct', referenceLane: '1' });
  assert.match(plot.svg, /Target signal relative to reference/);
  assert.match(plot.svg, /Direct target normalization · Reference lane: 1/);
  assert.match(plot.svg, /reference is missing/);
});
