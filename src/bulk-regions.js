import { validateLayout } from './regions.js';

function clone(m) { return { ...m, band: { ...m.band }, ...(m.background ? { background: { ...m.background } } : {}) }; }
export function validateRectangles(measurements, pending, width, height) {
  for (const m of [...measurements, ...(pending ? [pending] : [])]) for (const r of [m.band, m.background].filter(Boolean)) {
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger) || r.x < 0 || r.y < 0 || r.w < 2 || r.h < 2 || r.x + r.w > width || r.y + r.h > height) throw new Error('The edit would place a box outside the image. Use a smaller size or a different position.');
  }
  validateLayout(measurements, pending);
}
export function groupKinds(scope) { return scope === 'all' ? ['target', 'control'] : [scope === 'control' ? 'control' : 'target']; }

export function arrangeBands(measurements, scope, action, options, width, height) {
  const next = measurements.map(clone);
  const kinds = groupKinds(scope);
  const origin = next.find(m => m.id === options.anchorId && kinds.includes(m.kind)) || next.filter(m => m.kind === kinds[0]).sort((a, b) => a.band.x - b.band.x)[0] || next[0];
  const originY = origin?.band.y;
  let affected = 0;
  for (const kind of kinds) {
    const group = next.filter(m => m.kind === kind).sort((a, b) => (a.band.x + a.band.w / 2) - (b.band.x + b.band.w / 2));
    if (!group.length) continue;
    const anchor = group.find(m => m.id === options.anchorId) || group[0];
    if (action === 'align') {
      const y = options.y === undefined ? anchor.band.y : options.y + (scope === 'all' ? anchor.band.y - originY : 0);
      group.forEach(m => { m.band.y = y; affected++; });
    } else if (action === 'distribute') {
      if (group.length < 3) continue;
      const left = group[0].band.x + group[0].band.w / 2;
      const right = group.at(-1).band.x + group.at(-1).band.w / 2;
      group.slice(1, -1).forEach((m, i) => { m.band.x = Math.round(left + (right - left) * (i + 1) / (group.length - 1) - m.band.w / 2); });
      affected += group.length;
    } else if (action === 'size') {
      group.forEach(m => {
        m.band.w = options.w; m.band.h = options.h;
        if (options.backgrounds) { m.background.w = options.w; m.background.h = options.h; }
        affected++;
      });
    } else throw new Error('Unknown layout operation');
  }
  if (!affected) throw new Error(action === 'distribute' ? 'Draw at least three bands of the same type to distribute their centers.' : 'No completed bands in the chosen group.');
  validateRectangles(next, null, width, height);
  return next;
}

export function editBox(measurements, pending, id, part, rect, alignment, width, height) {
  const next = measurements.map(clone), nextPending = pending ? clone(pending) : null;
  const record = next.find(m => m.id === id) || (nextPending?.id === id ? nextPending : null);
  if (!record) throw new Error('Select a box first.');
  record[part] = { ...rect };
  const nextAlignment = { ...alignment };
  if (part === 'band' && Number.isFinite(alignment[record.kind])) {
    nextAlignment[record.kind] = rect.y;
    for (const m of [...next, ...(nextPending ? [nextPending] : [])]) if (m.kind === record.kind) m.band.y = rect.y;
  }
  validateRectangles(next, nextPending, width, height);
  return { measurements: next, pending: nextPending, alignment: nextAlignment };
}
