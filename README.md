# Western blot densitometry

A browser-based tool for manual Western blot quantification. Development prototype: measurements have not yet been validated against a reference workflow.

## Run locally

Download the repository ZIP and unzip the entire folder. Open `index.html` in Chrome, Firefox, Safari, or Edge. The committed `dist/app.js` contains the app and TIFF decoder; keep the `dist` folder beside `index.html`. Python and npm are not required to use the downloaded app.

A static server remains optional:

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Develop and test

Requires Node.js 18 or newer and npm:

```sh
npm ci
npm run build
npm test
```

Rebuild and commit `dist/app.js` after source changes so downloaded copies remain usable. Dependencies are pinned in the lockfile. The TIFF decoder and its dependencies are bundled locally; the app makes no CDN requests. License notices are in THIRD_PARTY_LICENSES.txt.

## Current workflow

1. Open a TIFF (.tif/.tiff), JPEG (.jpg/.jpeg), or 8-bit PNG, or load the synthetic example. The status beside the input reports loading errors, bit depth, and conversion notes.
2. Choose dark or bright signal polarity, the next lane label, and band type. Color images are automatically converted to weighted grayscale for both display and measurement.
3. Click and drag around the first band to define its box dimensions. Blue boxes are target bands; purple boxes are loading controls.
4. Under **Background placement**, choose automatic above/below and a pixel gap to generate a same-size orange background as soon as you draw a band, or leave **Draw manually** selected and select nearby blank background. With **Keep subsequent boxes the same size** checked, click or drag to position a box of the remembered size. After each completed pair, the lane label advances automatically so you can continue adding bands.
5. Uncheck the size lock to draw each rectangle independently. **Draw a new box size** overrides the lock for the next rectangle. Target and control band sizes are remembered separately. Exact pixel dimensions remain available under the optional dimensions panel.
6. Click a box to select it; drag inside it to move, or drag one of its corner handles to resize. Arrow keys nudge a selected box by one image pixel, or ten with Shift. **Move or resize existing boxes** prevents drawing new boxes while editing. A results row also selects its band.
7. Change a selected pair's lane label, reuse a selected box's dimensions, or delete a selected band/background pair. Background boxes must not overlap any band; invalid edits are rejected and restored.
8. Switch to loading controls; the next label starts at the first target missing a control. Use the same lane labels for target/control pairs. Choose a reference lane and reference-normalization method, then export full-precision CSV measurements and an annotated SVG with editable Arial text.

## Automatic backgrounds

Choose **Automatically above band** or **Automatically below band** and a nonnegative whole-pixel gap. Every new band gets a matching-size background, and its quantification appears immediately. Backgrounds must be inside the image and cannot overlap any band. If placement fails, the blue/purple pending band remains: draw a background manually, or change the position setting and press **Place background for selected band**. This button also replaces the selected completed band's background after validating the proposed layout.

With **Remember background adjustments for subsequent bands** checked, moving, nudging, or resizing an orange background stores its relative position and switches automatic placement to **Reuse adjusted offset**. Above/below offsets preserve the edge-to-edge gap and horizontal offset when the next band has a different height. Sideways positions preserve X/Y offsets. Automatically generated backgrounds always match the new band's size. Target and control offsets are stored separately, with the last offset used as a starting point for a new type. **Use selected background offset for new bands** explicitly activates reuse from an existing pair.

Both boxes can still be moved and resized independently. Existing backgrounds stay in place when bands are moved or group alignment/spacing is applied. Switch back to above/below to reset the position to directly above/below at the entered gap, uncheck remembering to stop learning adjustments, or choose manual placement. Loading another image clears remembered offsets. Check every automatic background for suitable blank signal.

## Alignment, spacing and numeric sizes

Under **Align and size band groups**, choose target bands, loading controls, or both types as separate rows. Complete or cancel a pending band/background pair before applying a group operation.

- **Align top edges to selected band** uses the selected pair's band Y position for its row. If that row has no selected band, the leftmost band is the anchor. **Align at this Y** accepts an exact top-edge pixel coordinate. When both types are chosen, numeric alignment preserves the vertical offset between target and control row anchors.
- **Keep band top edges aligned** aligns the selected group and locks each row. Newly drawn bands snap to the row Y position. Moving or resizing the top edge of a band shifts every band of that type to the new Y; background boxes stay in place. Uncheck it to move boxes independently.
- **Distribute centers evenly** uses existing left-to-right order, keeps the leftmost and rightmost band centers fixed, and positions intervening centers evenly. At least three bands of the same type are needed. Rounding to whole image pixels can produce one-pixel differences between intervals.
- **Selected box** provides numeric width/height and **Apply size to selected box**, including for orange background boxes.
- **Group width/height** and **Apply size to all bands in group** resize completed band boxes in the chosen group. Select **Resize paired background boxes too** to include their backgrounds. Each box's top-left corner stays fixed. Group sizes also become the templates for newly drawn bands of those types.

Bounds and background overlap checks apply to the entire proposed change. If any resulting box would be outside the image or a background would overlap a band, the whole operation is rejected without modifying measurements. Quantifications and plots recalculate after successful changes.

## Live quantification plot

The plot below the blot updates when a band/background pair is completed and when a box is moved, resized, nudged, relabeled or deleted. During dragging, it previews a valid candidate position; releasing applies the edit, while cancellation restores the saved values. Incomplete bands require a background box before quantification.

Choose background-corrected signal (target and control bars), target/loading-control ratio (target bars only), or values relative to the selected reference lane. Negative corrected signals remain visible. Normalization that lacks the inputs required by the selected method is labeled NA, not plotted as zero. Bars represent individual measurements; there are no replicate summaries or error bars. Hover for values and flags; click a bar to select its band.

**Export plot SVG** downloads the committed measurements in the selected view with editable Arial text. Long lane labels are shortened on the axis; their complete labels remain in tooltips and exported SVG titles. Larger plots scroll horizontally.

Keep target box sizes consistent across lanes, and control sizes consistent across lanes, unless you have a justified reason to change them. Resizing a box recalculates its measurement but does not automatically alter the remembered template; use **Use selected size for new bands** to adopt it.

Images and measurements remain in browser memory. The app has no upload endpoint, analytics, or network dependencies at runtime. Refreshing or closing the page loses the current session. Do not commit experimental images or results to this repository; common data extensions are ignored.

## Calculations

For each analysis pixel, dark signal is `maximum value - grayscale value`; bright signal is `grayscale value`. The maximum is 255 for 8-bit images and 65535 for 16-bit TIFFs. Grayscale TIFFs preserve integer values at native depth; WhiteIsZero TIFF values are inverted to a BlackIsZero convention by the decoder. Color input uses `(2126 * R + 7152 * G + 722 * B) / 10000` without rounding the resulting measurement pixels. The reported raw signal is the sum of these signal values over the band box, not the untransformed grayscale sum.

`corrected signal = integrated signal - mean background signal * band area`

`normalized ratio = corrected target signal / corrected loading-control signal`

Reference normalization has two user-selectable methods:

- **Use loading controls** (default): `relative value = (corrected target / corrected control) / (reference target / reference control)`.
- **Direct to reference (no loading control)**: `relative value = corrected target / corrected reference target`. Loading-control bands are optional and do not enter this calculation.

Choose the method under **Normalization → Reference normalization**, select a reference lane, then choose **Relative to reference lane** in the plot. The reference lane becomes 1. The table heading, plot title and exported SVG identify the selected method; CSV exports include `reference_normalization_method` (`control` or `direct`). The target/control ratio column still requires a loading control regardless of the reference method.

Negative corrected signals are retained. Reference normalization is unavailable for nonpositive target/reference signals; the loading-control method also requires positive controls. Zero (dark polarity) or maximum-value (bright polarity) pixels are flagged as possibly clipped; image endpoints alone cannot establish detector saturation. PNG and JPEG values come from the browser decoder and can reflect color management. JPEG compression is lossy; prefer original TIFFs for quantitative analysis. TIFF pixel values are decoded separately from the 8-bit preview. The 16-bit preview uses a min-max contrast stretch for visibility, which does not change measurement values. Exported annotated SVGs embed that display preview, not the full-depth source TIFF. Match exposure settings and verify the linear response range independently.

## Initial development plan

- [x] Manual fixed-size band and paired background regions
- [x] Background subtraction, loading-control and reference normalization
- [x] Numerical tests, CSV export, annotated SVG with editable labels
- [ ] Validate measurements against ImageJ/Fiji using known images
- [x] Native unsigned 8-bit and 16-bit TIFF decoding and pixel-depth preservation
- [x] JPEG input and weighted grayscale conversion of RGB input
- [x] Bundled app that starts without JavaScript module imports
- [x] Drawn sizes, optional size lock, draggable/resizable boxes, automatic lane advance
- [x] Numeric individual/group sizes, persistent row alignment and equal horizontal spacing
- [ ] Zoom and session save/load
- [ ] Lane intensity profiles and assisted detection after manual workflow validation
- [x] Live bar plots, normalized views and editable SVG plot export
- [x] Direct target-to-reference normalization without a loading control
- [ ] Total-protein normalization and replicate summaries

## Format support and limits

- TIFF: unsigned 8-bit and 16-bit grayscale or interleaved RGB, uncompressed, LZW, or Deflate. Both byte orders, strips and decoder-supported tiles are supported. Standard top-left orientation is required.
- Multi-page TIFF: loads page 1 and visibly reports the total number of pages. Page selection is not implemented yet.
- JPEG: browser-decoded 8-bit input. RGB values are converted to weighted grayscale. JPEG measurements are based on lossy decoded pixels.
- PNG: 8-bit input, grayscale or RGB. Higher-depth PNGs remain unsupported; use native 16-bit TIFF instead.
- Transparency, signed/floating-point TIFF, PackBits/CCITT/JPEG-compressed TIFF, BigTIFF, nonstandard orientation, and planar TIFF channels are unsupported and produce loading errors.
- Image size is limited to 25 million pixels. The synthetic example is only for checking the workflow.

## Verification

Known-value TIFF fixtures generated with Pillow cover 8/16-bit pixels, both byte orders, LZW, Deflate, WhiteIsZero, and multi-page input. Numerical tests verify full-depth measurement and preview independence. Simulated-DOM tests run the committed bundle and verify startup, drawing the first box, repeated locked/unlocked boxes, lane advance, dragging, resizing, recalculation, overlap rejection, keyboard nudging, deletion, live plot previews, preview cancellation, normalization views, group sizing, alignment locks, equal spacing, automatic background placement, remembered offsets and invalid-placement recovery. Live browser/file-picker verification is still pending; the development browser cannot reach the local server in this environment.

## Project structure

- `index.html`, `style.css`: browser workspace
- `src/app.js`: input, region selection, tables, and exports
- `src/analysis.js`: numerical calculations
- `src/image-input.js`: format detection, native TIFF decoding, grayscale conversion and previews
- `src/regions.js`: image/display geometry, region editing and lane progression
- `src/backgrounds.js`: same-size background generation and relative offset learning
- `src/bulk-regions.js`: group alignment, distribution, sizes and transactional validation
- `src/plot.js`: live SVG charts and plot export
- `dist/app.js`: committed, ready-to-run browser bundle
- `test/`: numerical, TIFF fixture and bundle startup checks

The original repository LICENSE is retained.
