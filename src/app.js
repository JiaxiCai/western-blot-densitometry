import { quantify, normalize, csvCell } from './analysis.js';
import { decodeImageFile, toGrayscale, displayRGBA } from './image-input.js';
import { imagePoint, drawnRect, positionedRect, movedRect, resizedRect, corners, hitRegion, validateLayout, nextLane } from './regions.js';

const $ = id => document.getElementById(id);
const canvas = $('blot'), ctx = canvas.getContext('2d');
let image = null, pixels = null, measurements = [], pending = null, filename = '';
let imageMetadata = { maxValue: 255, bitDepth: 8, format: 'PNG', pages: 1, hasColor: false };
let selected = null, gesture = null, nextId = 1, forceFree = false;
let templates = { target: null, control: null };
const colors = { target: '#007caa', control: '#a251c8', background: '#df7a00' };
function message(text) { $('message').textContent = text; }
function loadStatus(text, state = 'info') {
  $('load-status').textContent = text;
  $('load-status').dataset.state = state;
}
function pointAt(event) {
  return imagePoint(event.clientX, event.clientY, canvas.getBoundingClientRect(), canvas.width, canvas.height);
}
function recordFor(id) { return measurements.find(m => m.id === id) || (pending?.id === id ? pending : null); }
function regions() {
  return [...measurements, ...(pending ? [pending] : [])].flatMap(m => [
    { id: m.id, part: 'band', rect: m.band },
    ...(m.background ? [{ id: m.id, part: 'background', rect: m.background }] : [])
  ]);
}
function nextSize() {
  if (forceFree || !$('lock-size').checked) return null;
  return pending ? { w: pending.band.w, h: pending.band.h } : templates[$('kind').value];
}
function updateEditor() {
  const size = nextSize();
  $('size-hint').textContent = size ? `Next box: ${size.w} × ${size.h} pixels. Click or drag to position it.` : 'Drag from one corner to the opposite corner to define the box size.';
  if (size) { $('box-w').value = size.w; $('box-h').value = size.h; }
  const record = selected ? recordFor(selected.id) : null;
  const rect = record?.[selected?.part];
  $('selected-info').textContent = rect ? `Lane ${record.lane} · ${selected.part === 'band' ? record.kind : 'background'} · x=${rect.x}, y=${rect.y}, ${rect.w} × ${rect.h} pixels` : 'Click a box to select it. Drag inside to move; drag a corner to resize.';
  $('selected-lane').disabled = !record; $('selected-lane').value = record?.lane || '';
  $('delete-selected').disabled = !record; $('reuse-size').disabled = !rect;
}
function paint() {
  if (!image) return;
  ctx.drawImage(image, 0, 0);
  function draw(r, color, label, dashed, id, part) {
    if (gesture && gesture.type !== 'draw' && gesture.id === id && gesture.part === part) r = gesture.rect;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dashed ? [5, 3] : []);
    ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.setLineDash([]);
    ctx.font = '14px Arial'; ctx.fillStyle = color; ctx.fillText(label, r.x, Math.max(14, r.y - 4));
    if (selected && selected.id === id && selected.part === part) {
      const scale = canvas.width / canvas.getBoundingClientRect().width;
      const handle = Math.min(7 * scale, r.w / 3, r.h / 3);
      ctx.fillStyle = 'white';
      for (const p of Object.values(corners(r))) { ctx.fillRect(p.x - handle / 2, p.y - handle / 2, handle, handle); ctx.strokeRect(p.x - handle / 2, p.y - handle / 2, handle, handle); }
    }
  }
  measurements.forEach(m => { draw(m.band, colors[m.kind], `${m.lane} ${m.kind}`, false, m.id, 'band'); draw(m.background, colors.background, `${m.lane} bg`, true, m.id, 'background'); });
  if (pending) draw(pending.band, colors[pending.kind], `${pending.lane} ${pending.kind}`, false, pending.id, 'band');
  if (gesture?.type === 'draw') draw(gesture.rect, pending ? colors.background : colors[$('kind').value], pending ? 'Background' : 'New band', !!pending);
  $('step').textContent = $('tool').value === 'move' ? 'Select, move, or resize a box' : pending ? `Select background for lane ${pending.lane}` : `Draw ${$('kind').value} band for lane ${$('lane').value}`;
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
    tr.tabIndex = 0; tr.classList.toggle('selected', selected?.id === r.id);
    tr.addEventListener('click', () => { selected = { id: r.id, part: 'band' }; refresh(false); });
    tr.addEventListener('keydown', event => { if (event.key === 'Enter') { selected = { id: r.id, part: 'band' }; refresh(false); canvas.focus(); } });
    [r.lane, r.kind, r.area, format(r.sum), format(r.backgroundMean), format(r.corrected), format(r.ratio), format(r.relative), r.flags || '-'].forEach(value => {
      const td = document.createElement('td'); td.textContent = value; tr.append(td);
    });
    $('results').append(tr);
  });
  $('export').disabled = !measurements.length; $('annotated').disabled = !measurements.length;
  $('cancel').disabled = !pending; $('undo').disabled = !measurements.length;
  $('kind').disabled = !!pending;
  updateEditor();
  paint();
}
function installImage(decoded, name) {
  const { width: w, height: h } = decoded;
  const source = document.createElement('canvas'); source.width = w; source.height = h;
  source.getContext('2d').putImageData(new ImageData(displayRGBA(decoded.pixels, decoded.maxValue, decoded.bitDepth === 16), w, h), 0, 0);
  image = source; pixels = decoded.pixels; imageMetadata = decoded; filename = name; measurements = []; pending = null;
  selected = null; gesture = null; nextId = 1; forceFree = false; templates = { target: null, control: null };
  $('lane').value = '1'; $('tool').value = 'draw';
  canvas.width = w; canvas.height = h; canvas.style.display = 'block'; $('empty').hidden = true;
  $('box-w').value = Math.min(60, w); $('box-h').value = Math.min(24, h);
  $('image-info').textContent = `${name} · ${w} × ${h} pixels · ${decoded.bitDepth}-bit ${decoded.format}`;
  const notes = [];
  if (decoded.format === 'JPEG') notes.push('JPEG is lossy; use the original TIFF for quantitative work.');
  notes.push(decoded.hasColor ? 'Automatically converted to grayscale for display and measurement.' : 'Grayscale image ready.');
  if (decoded.pages > 1) notes.push(`Page 1 of ${decoded.pages} is loaded.`);
  if (decoded.bitDepth === 16) notes.push('Preview contrast is stretched; measurements use original 16-bit values.');
  loadStatus(`Loaded ${name}. ${notes.join(' ')}`);
  refresh(); message('Drag around the first band to define its box. Blue/purple boxes measure bands; dashed orange boxes measure background.');
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
function beginDraw(rect) {
  if (!pending) {
    let lane = $('lane').value.trim(), kind = $('kind').value;
    if (!lane) throw new Error('Enter a lane label.');
    if (measurements.some(m => m.lane === lane && m.kind === kind)) lane = nextLane(lane, kind, measurements);
    const candidate = { id: nextId++, lane, kind, band: rect };
    validateLayout(measurements, candidate);
    pending = candidate; $('lane').value = lane;
    templates[kind] = { w: rect.w, h: rect.h };
    selected = { id: pending.id, part: 'band' };
    message(`Band selected for lane ${lane}. Now select a blank area for its orange background box.`);
  } else {
    const candidate = { ...pending, background: rect };
    validateLayout([...measurements, candidate]);
    measurements.push(candidate); pending = null;
    selected = { id: candidate.id, part: 'background' };
    $('lane').value = nextLane(candidate.lane, candidate.kind, measurements);
    message(`Lane ${candidate.lane} saved. Continue with lane ${$('lane').value}. Drag any box to move it; select a corner to resize.`);
  }
  forceFree = false;
}
function applyRect(id, part, rect) {
  const record = recordFor(id); if (!record) return;
  const old = record[part]; record[part] = rect;
  try { validateLayout(measurements, pending); }
  catch (error) { record[part] = old; throw error; }
}
canvas.addEventListener('pointerdown', event => {
  if (!image || gesture || (event.button !== undefined && event.button !== 0)) return;
  event.preventDefault(); canvas.focus();
  const point = pointAt(event);
  const hit = hitRegion(regions(), point, selected, 8 * canvas.width / canvas.getBoundingClientRect().width);
  if (hit) {
    selected = { id: hit.id, part: hit.part };
    gesture = { type: hit.corner ? 'resize' : 'move', id: hit.id, part: hit.part, corner: hit.corner, original: { ...hit.rect }, start: point, rect: { ...hit.rect }, pointerId: event.pointerId };
  } else if ($('tool').value === 'draw') {
    const size = nextSize();
    gesture = { type: 'draw', start: point, size, rect: size ? positionedRect(point, size, canvas.width, canvas.height) : drawnRect(point, point), pointerId: event.pointerId };
    selected = null;
  } else { selected = null; refresh(false); return; }
  canvas.setPointerCapture(event.pointerId);
  canvas.style.cursor = 'grabbing'; updateEditor(); paint();
});
canvas.addEventListener('pointermove', event => {
  if (!image) return;
  const point = pointAt(event);
  if (!gesture) {
    const hit = hitRegion(regions(), point, selected, 8 * canvas.width / canvas.getBoundingClientRect().width);
    canvas.style.cursor = hit?.corner ? (['nw', 'se'].includes(hit.corner) ? 'nwse-resize' : 'nesw-resize') : hit ? 'grab' : $('tool').value === 'draw' ? 'crosshair' : 'default';
    return;
  }
  if (event.pointerId !== gesture.pointerId) return;
  if (gesture.type === 'draw') gesture.rect = gesture.size ? positionedRect(point, gesture.size, canvas.width, canvas.height) : drawnRect(gesture.start, point);
  else if (gesture.type === 'resize') gesture.rect = resizedRect(gesture.original, gesture.corner, point, canvas.width, canvas.height);
  else gesture.rect = movedRect(gesture.original, gesture.start, point, canvas.width, canvas.height);
  paint();
});
canvas.addEventListener('pointerup', event => {
  if (!gesture || event.pointerId !== gesture.pointerId) return;
  const current = gesture, point = pointAt(event);
  // Some devices send a release position without a final pointermove.
  if (current.type === 'draw') current.rect = current.size ? positionedRect(point, current.size, canvas.width, canvas.height) : drawnRect(current.start, point);
  else if (current.type === 'resize') current.rect = resizedRect(current.original, current.corner, point, canvas.width, canvas.height);
  else current.rect = movedRect(current.original, current.start, point, canvas.width, canvas.height);
  gesture = null;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  try {
    if (current.rect.w < 2 || current.rect.h < 2) throw new Error('Drag to draw a box at least 2 × 2 pixels.');
    if (current.type === 'draw') beginDraw(current.rect);
    else { applyRect(current.id, current.part, current.rect); message('Box updated. Measurements recalculated. Arrow keys move the selected box one pixel; Shift + arrow moves ten.'); }
  } catch (error) { message(error.message); }
  refresh();
});
function cancelGesture() { gesture = null; refresh(false); }
canvas.addEventListener('pointercancel', cancelGesture);
canvas.addEventListener('lostpointercapture', () => { if (gesture) cancelGesture(); });
function deleteSelected() {
  if (!selected) return;
  if (pending?.id === selected.id) pending = null;
  else measurements = measurements.filter(m => m.id !== selected.id);
  selected = null; gesture = null; refresh(); message('Selected band and its paired background removed.');
}
canvas.addEventListener('keydown', event => {
  if (event.key === 'Escape') { event.preventDefault(); gesture = null; pending = null; selected = null; refresh(); return; }
  if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); deleteSelected(); return; }
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!selected || !directions[event.key]) return;
  event.preventDefault(); const record = recordFor(selected.id); if (!record) return;
  const [dx, dy] = directions[event.key], step = event.shiftKey ? 10 : 1;
  try { applyRect(selected.id, selected.part, movedRect(record[selected.part], { x: 0, y: 0 }, { x: dx * step, y: dy * step }, canvas.width, canvas.height)); }
  catch (error) { message(error.message); }
  refresh(false);
});
$('selected-lane').addEventListener('change', () => {
  const record = selected ? recordFor(selected.id) : null; if (!record) return;
  const lane = $('selected-lane').value.trim();
  if (!lane || measurements.some(m => m.id !== record.id && m.lane === lane && m.kind === record.kind)) { message('Use a nonempty lane label without duplicating this band type.'); updateEditor(); return; }
  record.lane = lane; refresh();
});
$('delete-selected').addEventListener('click', deleteSelected);
$('reuse-size').addEventListener('click', () => {
  const record = selected ? recordFor(selected.id) : null; if (!record) return;
  const rect = record[selected.part]; templates[$('kind').value] = { w: rect.w, h: rect.h };
  $('lock-size').checked = true; forceFree = false; refresh(false);
});
$('draw-new-size').addEventListener('click', () => { forceFree = true; $('tool').value = 'draw'; refresh(false); message('Drag a new rectangle to define the next box size.'); });
$('lock-size').addEventListener('change', () => { forceFree = false; refresh(false); });
$('tool').addEventListener('change', () => { gesture = null; refresh(false); });
$('kind').addEventListener('change', () => {
  if (!pending) {
    const kind = $('kind').value;
    const unpaired = measurements.find(m => m.kind === 'target' && !measurements.some(c => c.kind === 'control' && c.lane === m.lane));
    $('lane').value = kind === 'control' && unpaired ? unpaired.lane : '1';
  }
  refresh(false);
});
for (const id of ['box-w', 'box-h']) $(id).addEventListener('change', () => {
  const w = Number($('box-w').value), h = Number($('box-h').value);
  if (!image || !Number.isInteger(w) || !Number.isInteger(h) || w < 2 || h < 2 || w > canvas.width || h > canvas.height) { message('Box dimensions must be whole numbers within the image, at least 2 × 2.'); return; }
  if (pending) { message('Draw or resize the pending background box; numeric dimensions apply to new bands.'); return; }
  templates[$('kind').value] = { w, h }; $('lock-size').checked = true; forceFree = false; refresh(false);
});
$('lane').addEventListener('input', () => paint());
$('cancel').addEventListener('click', () => { pending = null; gesture = null; selected = null; forceFree = false; refresh(); });
$('undo').addEventListener('click', () => { pending = null; gesture = null; selected = null; measurements.pop(); refresh(); });
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
