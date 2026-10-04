import { overlap } from './analysis.js';

// A local-contrast mask followed by 8-connected components. Native pixels only.
export function detectBands(pixels, width, height, options = {}) {
  const { maxValue = 255, polarity = 'dark', contrast = 8, radius = 60,
    minWidth = 12, minHeight = 3, maxHeight = 60, padding = 3,
    top = 0, bottom = height, exclude = [], limit = 200 } = options;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || pixels.length !== width * height) throw new Error('Invalid image dimensions.');
  if (!['dark', 'bright'].includes(polarity) || !(maxValue > 0) || !(contrast > 0 && contrast <= 100)) throw new Error('Contrast must be greater than 0 and at most 100%.');
  if (![radius, minWidth, minHeight, maxHeight, padding, top, bottom, limit].every(Number.isInteger) || radius < 1 || minWidth < 2 || minHeight < 2 || maxHeight < minHeight || padding < 0 || top < 0 || bottom > height || top >= bottom || limit < 1) throw new Error('Detection sizes and row limits must be valid whole pixels.');
  // Keep working memory bounded for very large TIFFs, without downsampling.
  if (width * height > 16000000) throw new Error('Detection currently supports images up to 16 million pixels. Crop a copy for detection; manual measurement remains available.');
  const stride = width + 1, integral = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      const raw = pixels[y * width + x];
      if (!Number.isFinite(raw) || raw < 0 || raw > maxValue) throw new Error('Invalid image pixel value.');
      sum += polarity === 'dark' ? maxValue - raw : raw;
      integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + sum;
    }
  }
  const mask = new Uint8Array(width * height), threshold = maxValue * contrast / 100;
  for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) {
    const l = Math.max(0, x - radius), r = Math.min(width, x + radius + 1);
    const t = Math.max(0, y - radius), b = Math.min(height, y + radius + 1);
    const mean = (integral[b * stride + r] - integral[t * stride + r] - integral[b * stride + l] + integral[t * stride + l]) / ((r - l) * (b - t));
    const signal = polarity === 'dark' ? maxValue - pixels[y * width + x] : pixels[y * width + x];
    if (signal - mean >= threshold) mask[y * width + x] = 1;
  }
  const candidates = [], queue = [];
  let qualifying = 0;
  for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) {
    const seed = y * width + x; if (!mask[seed]) continue;
    queue.length = 0; queue.push(seed); mask[seed] = 0;
    let left = x, right = x, low = y, high = y, count = 0;
    for (let head = 0; head < queue.length; head++) {
      const p = queue[head], yy = Math.floor(p / width), xx = p % width; count++;
      left = Math.min(left, xx); right = Math.max(right, xx); low = Math.min(low, yy); high = Math.max(high, yy);
      for (let ny = Math.max(top, yy - 1); ny <= Math.min(bottom - 1, yy + 1); ny++) for (let nx = Math.max(0, xx - 1); nx <= Math.min(width - 1, xx + 1); nx++) {
        const n = ny * width + nx; if (mask[n]) { mask[n] = 0; queue.push(n); }
      }
    }
    const w = right - left + 1, h = high - low + 1;
    if (w < minWidth || h < minHeight || h > maxHeight || count / (w * h) < 0.2) continue;
    const bx = Math.max(0, left - padding), by = Math.max(0, low - padding);
    const rect = { x: bx, y: by, w: Math.min(width, right + 1 + padding) - bx, h: Math.min(height, high + 1 + padding) - by };
    if (exclude.some(r => overlap(r, rect))) continue;
    qualifying++;
    if (candidates.length < limit) candidates.push(rect);
  }
  candidates.sort((a, b) => a.y - b.y || a.x - b.x);
  return { candidates, truncated: qualifying > limit };
}
