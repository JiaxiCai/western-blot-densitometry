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
2. Choose dark or bright signal polarity. Set lane label, band type, and box dimensions in original-image pixels.
3. Click the center of a band, then a nearby blank area to place its background box. Background must not include bands; the operator is responsible for selecting an appropriate area.
4. Measure target and loading-control bands using the same lane label. Use consistent target box sizes across lanes, and consistent control box sizes across lanes.
5. Choose a reference lane. Export full-precision measurements as CSV and regions as an annotated SVG with editable Arial text.

Images and measurements remain in browser memory. The app has no upload endpoint, analytics, or network dependencies at runtime. Refreshing or closing the page loses the current session. Do not commit experimental images or results to this repository; common data extensions are ignored.

## Calculations

For each analysis pixel, dark signal is `maximum value - grayscale value`; bright signal is `grayscale value`. The maximum is 255 for 8-bit images and 65535 for 16-bit TIFFs. Grayscale TIFFs preserve integer values at native depth; WhiteIsZero TIFF values are inverted to a BlackIsZero convention by the decoder. Color input uses `(2126 * R + 7152 * G + 722 * B) / 10000` without rounding the resulting measurement pixels. The reported raw signal is the sum of these signal values over the band box, not the untransformed grayscale sum.

`corrected signal = integrated signal - mean background signal * band area`

`normalized ratio = corrected target signal / corrected loading-control signal`

`relative value = normalized ratio / reference-lane normalized ratio`

Negative corrected signals are retained. Normalization is unavailable for nonpositive target or control signals. Zero (dark polarity) or maximum-value (bright polarity) pixels are flagged as possibly clipped; image endpoints alone cannot establish detector saturation. PNG and JPEG values come from the browser decoder and can reflect color management. JPEG compression is lossy; prefer original TIFFs for quantitative analysis. TIFF pixel values are decoded separately from the 8-bit preview. The 16-bit preview uses a min-max contrast stretch for visibility, which does not change measurement values. Exported annotated SVGs embed that display preview, not the full-depth source TIFF. Match exposure settings and verify the linear response range independently.

## Initial development plan

- [x] Manual fixed-size band and paired background regions
- [x] Background subtraction, loading-control and reference normalization
- [x] Numerical tests, CSV export, annotated SVG with editable labels
- [ ] Validate measurements against ImageJ/Fiji using known images
- [x] Native unsigned 8-bit and 16-bit TIFF decoding and pixel-depth preservation
- [x] JPEG input and weighted grayscale conversion of RGB input
- [x] Bundled app that starts without JavaScript module imports
- [ ] Editable and movable regions, zoom, and session save/load
- [ ] Lane intensity profiles and assisted detection after manual workflow validation
- [ ] Total-protein normalization and replicate summaries

## Format support and limits

- TIFF: unsigned 8-bit and 16-bit grayscale or interleaved RGB, uncompressed, LZW, or Deflate. Both byte orders, strips and decoder-supported tiles are supported. Standard top-left orientation is required.
- Multi-page TIFF: loads page 1 and visibly reports the total number of pages. Page selection is not implemented yet.
- JPEG: browser-decoded 8-bit input. RGB values are converted to weighted grayscale. JPEG measurements are based on lossy decoded pixels.
- PNG: 8-bit input, grayscale or RGB. Higher-depth PNGs remain unsupported; use native 16-bit TIFF instead.
- Transparency, signed/floating-point TIFF, PackBits/CCITT/JPEG-compressed TIFF, BigTIFF, nonstandard orientation, and planar TIFF channels are unsupported and produce loading errors.
- Image size is limited to 25 million pixels. The synthetic example is only for checking the workflow.

## Verification

Known-value TIFF fixtures generated with Pillow cover 8/16-bit pixels, both byte orders, LZW, Deflate, WhiteIsZero, and multi-page input. Numerical tests verify full-depth measurement and preview independence. A simulated-DOM smoke test verifies that the committed bundle starts and enables the input tools without module imports. Live browser/file-picker verification is still pending; the development browser cannot reach the local server in this environment.

## Project structure

- `index.html`, `style.css`: browser workspace
- `src/app.js`: input, region selection, tables, and exports
- `src/analysis.js`: numerical calculations
- `src/image-input.js`: format detection, native TIFF decoding, grayscale conversion and previews
- `dist/app.js`: committed, ready-to-run browser bundle
- `test/`: numerical, TIFF fixture and bundle startup checks

The original repository LICENSE is retained.
