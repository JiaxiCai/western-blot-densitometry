# Western blot densitometry

A browser-based tool for manual Western blot quantification. Development prototype: measurements have not yet been validated against a reference workflow.

## Run locally

Requires Python 3 for a static server. No package installation is needed.

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 in a browser. JavaScript modules require HTTP; opening index.html directly as a file is not supported. To run the numerical tests with Node.js 18 or newer:

```sh
npm test
```

## Current workflow

1. Open an unadjusted, opaque 8-bit grayscale PNG, or load the synthetic example.
2. Choose dark or bright signal polarity. Set lane label, band type, and box dimensions in original-image pixels.
3. Click the center of a band, then a nearby blank area to place its background box. Background must not include bands; the operator is responsible for selecting an appropriate area.
4. Measure target and loading-control bands using the same lane label. Use consistent target box sizes across lanes, and consistent control box sizes across lanes.
5. Choose a reference lane. Export full-precision measurements as CSV and regions as an annotated SVG with editable Arial text.

Images and measurements remain in browser memory. The app has no upload endpoint, analytics, or external dependencies. Refreshing or closing the page loses the current session. Do not commit experimental images or results to this repository; common data extensions are ignored.

## Calculations

For each original-image pixel, dark signal is `255 - grayscale value`; bright signal is `grayscale value`. The reported raw signal is the sum of these signal values over the band box, not the untransformed grayscale sum.

`corrected signal = integrated signal - mean background signal * band area`

`normalized ratio = corrected target signal / corrected loading-control signal`

`relative value = normalized ratio / reference-lane normalized ratio`

Negative corrected signals are retained. Normalization is unavailable for nonpositive target or control signals. Zero (dark polarity) or 255 (bright polarity) pixels are flagged as possibly clipped; image endpoints alone cannot establish detector saturation. Pixel values are read from browser-decoded PNG data, so this prototype is not a native instrument-data reader. Match exposure settings and verify the linear response range independently.

## Initial development plan

- [x] Manual fixed-size band and paired background regions
- [x] Background subtraction, loading-control and reference normalization
- [x] Numerical tests, CSV export, annotated SVG with editable labels
- [ ] Validate measurements against ImageJ/Fiji using known images
- [ ] Native 16-bit TIFF decoding and preservation of raw pixel depth
- [ ] Editable and movable regions, zoom, and session save/load
- [ ] Lane intensity profiles and assisted detection after manual workflow validation
- [ ] Total-protein normalization and replicate summaries

Current input is restricted to opaque 8-bit grayscale PNG. Color, transparent, and higher-depth PNG inputs are rejected. Do not reduce a 16-bit TIFF to 8 bits for final quantitative analysis merely to use this prototype. The synthetic example is only for checking the workflow.

## Project structure

- `index.html`, `style.css`: browser workspace
- `src/app.js`: input, region selection, tables, and exports
- `src/analysis.js`: numerical calculations
- `test/analysis.test.js`: known-value numerical checks

The original repository LICENSE is retained.
