import { overlap } from './analysis.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export function imagePoint(clientX, clientY, display, width, height) {
  return {
    x: clamp(Math.round((clientX - display.left) * width / display.width), 0, width),
    y: clamp(Math.round((clientY - display.top) * height / display.height), 0, height)
  };
}
export function drawnRect(start, end) {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(end.x - start.x), h: Math.abs(end.y - start.y) };
}
export function positionedRect(point, size, width, height) {
  return { x: clamp(point.x, 0, width - size.w), y: clamp(point.y, 0, height - size.h), w: size.w, h: size.h };
}
export function movedRect(original, start, end, width, height) {
  return positionedRect({ x: original.x + end.x - start.x, y: original.y + end.y - start.y }, original, width, height);
}
export function resizedRect(original, corner, point, width, height) {
  const left = corner.includes('w'), top = corner.includes('n');
  const opposite = { x: left ? original.x + original.w : original.x, y: top ? original.y + original.h : original.y };
  const end = {
    x: clamp(point.x, left ? 0 : opposite.x + 2, left ? opposite.x - 2 : width),
    y: clamp(point.y, top ? 0 : opposite.y + 2, top ? opposite.y - 2 : height)
  };
  return drawnRect(opposite, end);
}
export function corners(rect) {
  return { nw: { x: rect.x, y: rect.y }, ne: { x: rect.x + rect.w, y: rect.y }, sw: { x: rect.x, y: rect.y + rect.h }, se: { x: rect.x + rect.w, y: rect.y + rect.h } };
}
export function hitRegion(regions, point, selected, tolerance = 5) {
  if (selected) {
    const region = regions.find(r => r.id === selected.id && r.part === selected.part);
    if (region) for (const [corner, p] of Object.entries(corners(region.rect))) {
      const radius = Math.min(tolerance, region.rect.w / 4, region.rect.h / 4);
      if (Math.abs(point.x - p.x) <= radius && Math.abs(point.y - p.y) <= radius) return { ...region, corner };
    }
  }
  return [...regions].reverse().find(({ rect: r }) => point.x >= r.x && point.y >= r.y && point.x <= r.x + r.w && point.y <= r.y + r.h) || null;
}
export function validateLayout(measurements, pending = null) {
  const bands = [...measurements.map(m => m.band), ...(pending ? [pending.band] : [])];
  for (const m of measurements) {
    if (bands.some(band => overlap(m.background, band))) throw new Error('Background cannot overlap a band. Choose a blank area.');
  }
}
export function nextLane(current, kind, measurements) {
  const used = new Set(measurements.filter(m => m.kind === kind).map(m => m.lane));
  if (/^\d+$/.test(current)) {
    let next = Number(current) + 1;
    while (used.has(String(next))) next++;
    return String(next);
  }
  let index = 2;
  while (used.has(`${current} (${index})`)) index++;
  return `${current} (${index})`;
}
