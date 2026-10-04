export function backgroundForBand(band, offset) {
  if (!Number.isInteger(offset.dx) || (offset.side === 'offset' ? !Number.isInteger(offset.dy) : !Number.isInteger(offset.gap) || offset.gap < 0)) throw new Error('Background gap and offsets must be whole pixels; the gap cannot be negative.');
  const y = offset.side === 'above' ? band.y - band.h - offset.gap : offset.side === 'below' ? band.y + band.h + offset.gap : offset.side === 'offset' ? band.y + offset.dy : NaN;
  if (!Number.isFinite(y)) throw new Error('Choose an above, below, or remembered background position.');
  return { x: band.x + offset.dx, y, w: band.w, h: band.h };
}

export function offsetFromPair(band, background) {
  const dx = background.x - band.x;
  if (background.y + background.h <= band.y) return { side: 'above', gap: band.y - background.y - background.h, dx };
  if (background.y >= band.y + band.h) return { side: 'below', gap: background.y - band.y - band.h, dx };
  return { side: 'offset', dx, dy: background.y - band.y };
}

export function describeOffset(offset) {
  return offset.side === 'offset' ? `X offset ${offset.dx}px; Y offset ${offset.dy}px` : `${offset.side}, ${offset.gap}px gap; X offset ${offset.dx}px`;
}
