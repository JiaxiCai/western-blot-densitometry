import { bounds, overlap, quantify, normalize, csvCell } from './analysis.js';
import { decodeImageFile, toGrayscale, displayRGBA } from './image-input.js';

const $ = id => document.getElementById(id);
const canvas = $('blot'), ctx = canvas.getContext('2d');
let image = null, pixels = null, measurements = [], pending = null, filename = '';
let imageMetadata = { maxValue: 255, bitDepth: 8, format: 'PNG', pages: 1, hasColor: false };
const colors = { target: '#007caa', control: '#a251c8', background: '#df7a00' };
function message(text) { $('message').textContent = text; }
function loadStatus(text, state = 'info') {
  $('load-status').textContent = text;
  $('load-status').dataset.state = state;
}
function rectAt(event) {
  const box = canvas.getBoundingClientRect();
  const w = Number($('box-w').value), h = Number($('box-h').value);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > canvas.width || h > canvas.height) throw new Error('Choose positive box dimensions within the image size.');
  const x = Math.floor((event.clientX - box.left) * canvas.width / box.width - w / 2);
  const y = Math.floor((event.clientY - box.top) * canvas.height / box.height - h / 2);
  if (x < 0 || y < 0 || x + w > canvas.width || y + h > canvas.height) throw new Error('Place the whole box inside the image.');
  return bounds({ x, y, w, h }, canvas.width, canvas.height);
}
function paint() {
  if (!image) return;
  ctx.drawImage(image, 0, 0);
  function draw(r, color, label, dashed) {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [5, 3] : []);
    ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
    ctx.font = '14px Arial'; ctx.fillStyle = color; ctx.fillText(label, r.x, Math.max(14, r.y - 4));
  }
  measurements.forEach(m => { draw(m.band, colors[m.kind], `${m.lane} ${m.kind}`, false); draw(m.background, colors.background, `${m.lane} bg`, true); });
  if (pending) draw(pending.band, colors[pending.kind], `${pending.lane} ${pending.kind}`, false);
  $('step').textContent = pending ? 'Click a blank region for background' : 'Click to place a band box';
}
function data() {
  const rows = measurements.map(m => ({ ...m, ...quantify(pixels, canvas.width, canvas.height, m.band, m.background, $('polarity').value, imageMetadata.maxValue) }));
  const controls = new Map(rows.filter(r => r.kind === 'control').map(r => [r.lane, r.corrected]));
  const ref = rows.find(r => r.kind === 'target' && r.lane === $('reference').value);
  const referenceRatio = ref ? normalize(ref.corrected, controls.get(ref.lane)).ratio : null;
  return rows.map(r => {
    const n = r.kind === 'target' ? normalize(r.corrected, controls.get(r.lane), referenceRatio) : { ratio: null, relative: null };
    const flags = [];
    if (r.clipped) flags.push(`${r.clipped} endpoint pixel(s)`);
    if (r.corrected <= 0) flags.push('Nonpositive signal');
    if (r.kind === 'target' && !controls.has(r.lane)) flags.push('No loading control');
    else if (r.kind === 'target' && controls.get(r.lane) <= 0) flags.push('Nonpositive control');
    if (r.kind === 'target' && $('reference').value && !(referenceRatio > 0)) flags.push('Invalid reference');
    return { ...r, ...n, flags: flags.join('; ') };
  });
}
const format = v => v == null ? '-' : Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 });
function refresh(updateReference = true) {
  if (updateReference) {
    const current = $('reference').value;
    $('reference').replaceChildren(new Option('Choose reference lane', ''));
    measurements.filter(m => m.kind === 'target').forEach(m => $('reference').add(new Option(m.lane, m.lane)));
    if ([...$('reference').options].some(o => o.value === current)) $('reference').value = current;
  }
  $('results').replaceChildren();
  if (pixels) data().forEach(r => {
    const tr = document.createElement('tr');
    [r.lane, r.kind, r.area, format(r.sum), format(r.backgroundMean), format(r.corrected), format(r.ratio), format(r.relative), r.flags || '-'].forEach(value => {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    });
    $('results').append(tr);
  });
  $('export').disabled = !measurements.length; $('annotated').disabled = !measurements.length;
  $('cancel').disabled = !pending; $('undo').disabled = !measurements.length;
  paint();
}
function installImage(decoded, name) {
  const { width: w, height: h } = decoded;
  const source = document.createElement('canvas'); source.width = w; source.height = h;
  source.getContext('2d').putImageData(new ImageData(displayRGBA(decoded.pixels, decoded.maxValue, decoded.bitDepth === 16), w, h), 0, 0);
  image = source; pixels = decoded.pixels; imageMetadata = decoded; filename = name; measurements = []; pending = null;
  canvas.width = w; canvas.height = h; canvas.style.display = 'block'; $('empty').hidden = true;
  $('box-w').value = Math.min(60, w); $('box-h').value = Math.min(24, h);
  $('image-info').textContent = `${name} · ${w} × ${h} pixels · ${decoded.bitDepth}-bit ${decoded.format}`;
  const notes = [];
  if (decoded.format === 'JPEG') notes.push('JPEG is lossy; use the original TIFF for quantitative work.');
  if (decoded.hasColor) notes.push('Color pixels were converted to weighted grayscale.');
  if (decoded.pages > 1) notes.push(`Page 1 of ${decoded.pages} is loaded.`);
  if (decoded.bitDepth === 16) notes.push('Preview contrast is stretched; measurements use original 16-bit values.');
  loadStatus(`Loaded ${name}. ${notes.join(' ')} Click the image to select a band.`);
  refresh(); message('Place a target band, then select nearby background without other bands.');
}
$('file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const input = event.target;
  try {
    if (image && !confirm('Opening another image will clear the current measurements. Continue?')) return;
    loadStatus(`Loading ${file.name}...`);
    input.disabled = true; $('demo').disabled = true;
    installImage(await decodeImageFile(file), file.name);
  } catch (error) { message(error.message); loadStatus(`Image not loaded: ${error.message}`, 'error'); }
  finally { input.value = ''; input.disabled = false; $('demo').disabled = false; }
});
$('demo').addEventListener('click', () => {
  if (image && !confirm('Loading the example will clear the current measurements. Continue?')) return;
  const source = document.createElement('canvas'); source.width = 720; source.height = 300;
  const c = source.getContext('2d'); c.fillStyle = '#e6e6e6'; c.fillRect(0, 0, 720, 300);
  [80, 120, 160, 100].forEach((shade, i) => {
    c.fillStyle = `rgb(${shade},${shade},${shade})`; c.fillRect(70 + i * 155, 70, 60, 24);
    c.fillStyle = '#a0a0a0'; c.fillRect(70 + i * 155, 210, 60, 24);
  });
  const gray = toGrayscale(c.getImageData(0, 0, 720, 300).data, 720, 300, 4, 255);
  installImage({ ...gray, width: 720, height: 300, maxValue: 255, bitDepth: 8, format: 'Example', pages: 1 }, 'Synthetic example'); message('Example: targets at y=70 and controls at y=210. This is synthetic data, not a biological blot.');
});
canvas.addEventListener('click', event => {
  if (!image) return;
  try {
    const rect = rectAt(event);
    if (!pending) {
      const lane = $('lane').value.trim(), kind = $('kind').value;
      if (!lane) throw new Error('Enter a lane label.');
      if (measurements.some(m => m.lane === lane && m.kind === kind)) throw new Error('This lane already has this band type. Remove its measurement or use another label.');
      pending = { lane, kind, band: rect };
      message('Now click a blank area near this band to measure background.');
    } else {
      if (rect.w !== pending.band.w || rect.h !== pending.band.h) throw new Error('Keep the same box dimensions for this background selection.');
      if (overlap(rect, pending.band) || measurements.some(m => overlap(rect, m.band))) throw new Error('Background must not overlap a selected band.');
      measurements.push({ ...pending, background: rect }); pending = null;
      message('Measurement added. Select the next target or loading control.');
    }
    refresh();
  } catch (error) { message(error.message); }
});
$('cancel').addEventListener('click', () => { pending = null; refresh(); });
$('undo').addEventListener('click', () => { pending = null; measurements.pop(); refresh(); });
$('polarity').addEventListener('change', () => refresh(false));
$('reference').addEventListener('change', () => refresh(false));
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export').addEventListener('click', () => {
  const headers = ['image', 'format', 'bit_depth', 'pixel_max', 'page', 'color_conversion', 'polarity', 'reference_lane', 'lane', 'band_type', 'band_x', 'band_y', 'band_width', 'band_height', 'background_x', 'background_y', 'background_width', 'background_height', 'area_pixels', 'integrated_signal', 'background_mean', 'corrected_signal', 'target_control_ratio', 'relative_to_reference', 'endpoint_pixels', 'flags'];
  const rows = data().map(r => [filename, imageMetadata.format, imageMetadata.bitDepth, imageMetadata.maxValue, 1, imageMetadata.hasColor ? 'weighted RGB grayscale' : 'none', $('polarity').value, $('reference').value, r.lane, r.kind, r.band.x, r.band.y, r.band.w, r.band.h, r.background.x, r.background.y, r.background.w, r.background.h, r.area, r.sum, r.backgroundMean, r.corrected, r.ratio, r.relative, r.clipped, r.flags]);
  download([headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n'), 'densitometry.csv', 'text/csv;charset=utf-8');
});
const xml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
$('annotated').addEventListener('click', () => {
  const regions = measurements.map(m => [
    `<rect x="${m.band.x}" y="${m.band.y}" width="${m.band.w}" height="${m.band.h}" stroke="${colors[m.kind]}"/>`,
    `<rect x="${m.background.x}" y="${m.background.y}" width="${m.background.w}" height="${m.background.h}" stroke="${colors.background}" stroke-dasharray="5 3"/>`,
    `<text x="${m.band.x}" y="${Math.max(14, m.band.y - 4)}" fill="${colors[m.kind]}" stroke="none">${xml(m.lane)} ${m.kind}</text>`,
    `<text x="${m.background.x}" y="${Math.max(14, m.background.y - 4)}" fill="${colors.background}" stroke="none">${xml(m.lane)} bg</text>`
  ].join('')).join('');
  download(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}"><image href="${image.toDataURL('image/png')}" width="${canvas.width}" height="${canvas.height}"/><g fill="none" stroke-width="2" font-family="Arial" font-size="14">${regions}</g></svg>`, 'annotated-blot.svg', 'image/svg+xml');
});
refresh();
window.densitometryReady = true;
$('file').disabled = false;
$('demo').disabled = false;
loadStatus('Ready. Open a TIFF, JPEG, or PNG, or click Load example.');
