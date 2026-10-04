import { decode } from 'tiff';

export function detectFormat(buffer) {
  const b = new Uint8Array(buffer);
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)) return 'PNG';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'JPEG';
  if (b.length >= 4 && ((b[0] === 73 && b[1] === 73 && b[2] === 42 && b[3] === 0) || (b[0] === 77 && b[1] === 77 && b[2] === 0 && b[3] === 42))) return 'TIFF';
  throw new Error('Choose a PNG, JPEG (.jpg/.jpeg), or standard TIFF (.tif/.tiff). BigTIFF is not supported.');
}

export function checkDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 25000000) throw new Error('Choose an image with valid dimensions, up to 25 million pixels.');
}

export function toGrayscale(data, width, height, components, maxValue) {
  checkDimensions(width, height);
  if (![1, 2, 3, 4].includes(components) || data.length !== width * height * components) throw new Error('Unsupported image channel layout.');
  const color = components >= 3, alpha = components === 2 || components === 4;
  // Grayscale source arrays preserve exact integer values and native bit depth.
  const pixels = color ? new Float64Array(width * height) : maxValue === 65535 ? new Uint16Array(width * height) : new Uint8Array(width * height);
  let hasColor = false;
  for (let i = 0; i < pixels.length; i++) {
    const p = i * components;
    if (alpha && data[p + components - 1] !== maxValue) throw new Error('Transparent pixels are unsupported. Use an opaque image.');
    if (color) {
      const r = data[p], g = data[p + 1], b = data[p + 2];
      if (r === g && g === b) pixels[i] = r;
      else { pixels[i] = (2126 * r + 7152 * g + 722 * b) / 10000; hasColor = true; }
    } else pixels[i] = data[p];
  }
  return { pixels, hasColor };
}

export function decodeTiff(buffer) {
  let metadata;
  try { metadata = decode(buffer, { ignoreImageData: true }); }
  catch (error) { throw new Error(`TIFF could not be read: ${error.message}`); }
  if (!metadata.length) throw new Error('TIFF contains no image pages.');
  const first = metadata[0];
  checkDimensions(first.width, first.height);
  if (![8, 16].includes(first.bitsPerSample) || first.sampleFormat !== 1) throw new Error('TIFF support currently requires unsigned 8-bit or 16-bit samples.');
  if (![0, 1, 2].includes(first.type)) throw new Error('TIFF support currently requires grayscale or RGB pixels.');
  const depths = first.get('BitsPerSample');
  if (typeof depths !== 'number' && Array.from(depths).some(v => v !== first.bitsPerSample)) throw new Error('Mixed TIFF channel bit depths are unsupported.');
  if (first.planarConfiguration !== 1) throw new Error('TIFF channels must be interleaved (chunky layout).');
  if (first.orientation && first.orientation !== 1) throw new Error('This TIFF has a rotated orientation tag. Save a TIFF with top-left orientation before loading.');
  let page;
  try { [page] = decode(buffer, { pages: [0] }); }
  catch (error) { throw new Error(`TIFF decoding failed: ${error.message}`); }
  const maxValue = 2 ** page.bitsPerSample - 1;
  // The decoder already resolves byte order, compression, predictor and WhiteIsZero.
  const gray = toGrayscale(page.data, page.width, page.height, page.samplesPerPixel, maxValue);
  return { ...gray, width: page.width, height: page.height, maxValue, bitDepth: page.bitsPerSample, format: 'TIFF', pages: metadata.length };
}

export async function decodeImageFile(file) {
  const buffer = await file.arrayBuffer(), format = detectFormat(buffer);
  if (format === 'TIFF') return decodeTiff(buffer);
  if (format === 'PNG') {
    const bytes = new Uint8Array(buffer);
    if (bytes.length < 33 || bytes[24] !== 8) throw new Error('PNG input currently requires 8-bit samples. Use native 16-bit TIFF for higher-depth images.');
    const view = new DataView(buffer); checkDimensions(view.getUint32(16), view.getUint32(20));
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    try { await image.decode(); } catch { throw new Error(`The browser could not decode this ${format}. The file may be damaged or unsupported.`); }
    checkDimensions(image.naturalWidth, image.naturalHeight);
    const source = document.createElement('canvas'); source.width = image.naturalWidth; source.height = image.naturalHeight;
    const c = source.getContext('2d'); c.drawImage(image, 0, 0);
    const gray = toGrayscale(c.getImageData(0, 0, source.width, source.height).data, source.width, source.height, 4, 255);
    return { ...gray, width: source.width, height: source.height, maxValue: 255, bitDepth: 8, format, pages: 1 };
  } finally { URL.revokeObjectURL(url); }
}

export function displayRGBA(pixels, maxValue, stretch = false) {
  let low = 0, high = maxValue;
  if (stretch) {
    low = Infinity; high = -Infinity;
    for (const p of pixels) { low = Math.min(low, p); high = Math.max(high, p); }
    if (high === low) { low = 0; high = maxValue; }
  }
  const rgba = new Uint8ClampedArray(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const g = Math.round((pixels[i] - low) * 255 / (high - low));
    rgba.set([g, g, g, 255], i * 4);
  }
  return rgba;
}
