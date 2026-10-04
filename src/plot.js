const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const colors = { target: '#007caa', control: '#a251c8' };
const modes = {
  corrected: { field: 'corrected', title: 'Background-corrected signal', units: 'Integrated intensity (a.u.)' },
  ratio: { field: 'ratio', title: 'Target / loading control', units: 'Target / control ratio' },
  relative: { field: 'relative', title: 'Relative to reference lane', units: 'Relative signal (reference = 1)' }
};
function number(value) {
  if (value === 0) return '0';
  if (Math.abs(value) >= 100000 || Math.abs(value) < 0.001) return value.toExponential(2);
  return Number(value.toPrecision(4)).toLocaleString('en-US');
}
function tickStep(range) {
  const base = 10 ** Math.floor(Math.log10(range / 5));
  const factor = range / 5 / base;
  return (factor <= 1 ? 1 : factor <= 2 ? 2 : factor <= 5 ? 5 : 10) * base;
}

export function buildPlot(rows, mode = 'corrected', selectedId = null, options = {}) {
  mode = modes[mode] ? mode : 'corrected';
  const config = { ...modes[mode] };
  if (mode === 'relative' && options.referenceMethod) config.title = options.referenceMethod === 'direct' ? 'Target signal relative to reference' : 'Target/control relative to reference';
  const plotted = mode === 'corrected' ? rows : rows.filter(r => r.kind === 'target');
  const available = plotted.filter(r => Number.isFinite(r[config.field]));
  if (!plotted.length) return { svg: '', count: 0, missing: 0, title: config.title };
  const lanes = [...new Set(plotted.map(r => r.lane))];
  // Keep enough horizontal space for values and lane labels; the UI can scroll.
  const width = Math.max(640, 140 + lanes.length * (mode === 'corrected' ? 128 : 100));
  const height = 410, left = 100, right = width - 30, top = 72, bottom = 290;
  const values = available.map(r => r[config.field]);
  let low = Math.min(0, ...values), high = Math.max(mode === 'relative' ? 1 : 0, ...values);
  if (high === low) high = low + 1;
  const range = high - low, step = tickStep(range);
  low = low < 0 ? Math.floor((low - range * 0.12) / step) * step : 0;
  high = Math.ceil((high + range * 0.12) / step) * step;
  const y = value => bottom - (value - low) / (high - low) * (bottom - top);
  const baseline = y(0), laneWidth = (right - left) / lanes.length;
  const elements = [];
  elements.push(`<text x="${left}" y="28" font-size="18" font-weight="bold">${config.title}</text>`);
  if (mode === 'relative' && options.referenceMethod) elements.push(`<text x="${left}" y="52">${options.referenceMethod === 'direct' ? 'Direct target normalization' : 'Loading-control normalization'} · Reference lane: ${xml(options.referenceLane || 'not selected')}</text>`);
  if (mode === 'corrected') elements.push(`<rect x="${right - 174}" y="41" width="12" height="12" fill="${colors.target}"/><text x="${right - 156}" y="52">Target</text><rect x="${right - 90}" y="41" width="12" height="12" fill="${colors.control}"/><text x="${right - 72}" y="52">Control</text>`);
  for (let tick = low; tick <= high + step * 0.001; tick += step) {
    const clean = Math.abs(tick) < step * 1e-8 ? 0 : tick;
    elements.push(`<line x1="${left}" y1="${y(clean)}" x2="${right}" y2="${y(clean)}" stroke="#dbe3eb"/><text x="${left - 10}" y="${y(clean) + 5}" text-anchor="end">${number(clean)}</text>`);
  }
  if (mode === 'relative') elements.push(`<line x1="${left}" y1="${y(1)}" x2="${right}" y2="${y(1)}" stroke="#667c90" stroke-dasharray="5 4"/>`);
  elements.push(`<line x1="${left}" y1="${baseline}" x2="${right}" y2="${baseline}" stroke="#526579"/><line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="#526579"/>`);
  elements.push(`<text transform="translate(22 ${(top + bottom) / 2}) rotate(-90)" text-anchor="middle">${config.units}</text>`);
  lanes.forEach((lane, index) => {
    const center = left + (index + 0.5) * laneWidth;
    const label = lane.length > 18 ? lane.slice(0, 17) + '…' : lane;
    elements.push(`<text x="${center}" y="${bottom + 26}" text-anchor="middle"><title>Lane ${xml(lane)}</title>${xml(label)}</text>`);
    const series = mode === 'corrected' ? ['target', 'control'] : ['target'];
    for (const kind of series) {
      const r = plotted.find(item => item.lane === lane && item.kind === kind);
      if (!r) continue;
      const value = r[config.field], barWidth = Math.min(mode === 'corrected' ? 38 : 50, laneWidth * 0.32);
      const x = center - barWidth / 2 + (mode === 'corrected' ? (kind === 'target' ? -barWidth * 0.57 : barWidth * 0.57) : 0);
      const selected = selectedId === r.id;
      const description = `Lane ${r.lane}, ${kind}: ${Number.isFinite(value) ? value : 'unavailable'}${r.flags ? '. ' + r.flags : ''}`;
      const contents = Number.isFinite(value)
        ? `<rect x="${x}" y="${Math.min(y(value), baseline)}" width="${barWidth}" height="${Math.max(1, Math.abs(y(value) - baseline))}" fill="${colors[kind]}" stroke="${selected ? '#142d46' : colors[kind]}" stroke-width="${selected ? 3 : 1}"/><text x="${x + barWidth / 2}" y="${value >= 0 ? y(value) - 8 : y(value) + 18}" text-anchor="middle">${number(value)}</text>`
        : `<text x="${x + barWidth / 2}" y="${baseline - 10}" text-anchor="middle" fill="#667c90">NA</text>`;
      elements.push(`<g data-measurement-id="${r.id}" role="button" tabindex="0" aria-label="${xml(description)}"><title>${xml(description)}</title>${contents}</g>`);
    }
  });
  elements.push(`<text x="${(left + right) / 2}" y="${bottom + 55}" text-anchor="middle">Lane</text>`);
  if (plotted.length !== available.length) elements.push(`<text x="${left}" y="385" fill="#667c90">${mode === 'relative' && options.referenceMethod === 'direct' ? 'NA: reference is missing or corrected target/reference signal is nonpositive.' : 'NA: required control or reference is missing, or corrected signal is nonpositive.'}</text>`);
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${config.title}" font-family="Arial, sans-serif" font-size="14" fill="#172d40"><rect width="100%" height="100%" fill="white"/>${elements.join('')}</svg>`,
    count: available.length, missing: plotted.length - available.length, title: config.title
  };
}
