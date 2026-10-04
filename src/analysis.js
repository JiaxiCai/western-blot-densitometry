// Quantification operates on image coordinates, never on the scaled display.
export function bounds(rect, width, height) {
  if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite)) throw new Error('Invalid region');
  const x = Math.max(0, Math.min(width, Math.floor(rect.x)));
  const y = Math.max(0, Math.min(height, Math.floor(rect.y)));
  const right = Math.max(0, Math.min(width, Math.ceil(rect.x + rect.w)));
  const bottom = Math.max(0, Math.min(height, Math.ceil(rect.y + rect.h)));
  if (right <= x || bottom <= y) throw new Error('Region must contain pixels');
  return { x, y, w: right - x, h: bottom - y };
}

export function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function measure(pixels, width, height, rect, polarity = 'dark', maxValue = 255) {
  if (pixels.length !== width * height) throw new Error('Pixel dimensions do not match');
  if (!['dark', 'bright'].includes(polarity)) throw new Error('Invalid polarity');
  const r = bounds(rect, width, height);
  let sum = 0, clipped = 0;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const raw = pixels[y * width + x];
      sum += polarity === 'dark' ? maxValue - raw : raw;
      if (polarity === 'dark' ? raw === 0 : raw === maxValue) clipped++;
    }
  }
  const area = r.w * r.h;
  return { sum, area, mean: sum / area, clipped, rect: r };
}

export function quantify(pixels, width, height, band, background, polarity, maxValue = 255) {
  const signal = measure(pixels, width, height, band, polarity, maxValue);
  const bg = measure(pixels, width, height, background, polarity, maxValue);
  if (overlap(signal.rect, bg.rect)) throw new Error('Band and background regions overlap');
  return { ...signal, backgroundMean: bg.mean, corrected: signal.sum - bg.mean * signal.area };
}

export function normalize(target, control, referenceRatio) {
  const ratio = target > 0 && control > 0 ? target / control : null;
  return { ratio, relative: ratio !== null && referenceRatio > 0 ? ratio / referenceRatio : null };
}

export function normalizeWithReference(target, control, referenceTarget, referenceControl, method = 'control') {
  if (!['control', 'direct'].includes(method)) throw new Error('Invalid reference normalization method');
  const ratio = normalize(target, control).ratio;
  const numerator = method === 'direct' ? target : ratio;
  const baseline = method === 'direct' ? referenceTarget : normalize(referenceTarget, referenceControl).ratio;
  const relative = Number.isFinite(numerator) && numerator > 0 && Number.isFinite(baseline) && baseline > 0 ? numerator / baseline : null;
  return { ratio, relative };
}

export function csvCell(value) {
  let s = value == null ? '' : String(value);
  // Keep user-provided labels from being interpreted as spreadsheet formulas.
  if (/^[=+@-]/.test(s) && typeof value === 'string') s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
