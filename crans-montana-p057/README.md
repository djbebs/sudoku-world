# Crans-Montana Pixel Atlas · P0.5.7 (pixel art only)

## Open

**3D preview:** https://djbebs.github.io/sudoku-world/crans-montana-p057/?v=1

This is a separate prototype. The previous P0.5.6 and Sudoku World were not changed.

## User requirement implemented

**No photograph shown on the map**. The swisstopo SWISSIMAGE aerial photograph displayed in the uploaded recording was used only as a measurement/reference source. Its apparent paths, playground surfaces and pond outline were vectorised into `ycoor-traced-features.geojson`; the Three.js viewer converts these geographic coordinates into purely geometric, low-poly meshes with flat pixel-art materials. The P0.5.6 `ground-photo.js` texture is **not imported**, and the photo toggle was **not carried forward**.

The viewer retains: actual swissBUILDINGS3D roof meshes (streaming), official vegetation tiles when available, OSM geodata if available, time and season controls, isometric orthographic camera, and simulated pedestrians/cars when a safe route exists.

## New image-derived content (preliminary)

- Five walkway centerlines, approximately **211 metres total**, in a source GeoJSON, rendered as narrow beige strips with darker low-poly margins.
- One green playground ground surface.
- One sandy/light playground ground surface.
- One visible portion of the Ycoor pond, rendered with a stylised low-poly water material.
- All within the original **100 × 100 m** pilot centered at WGS84 **46.311036 N, 7.478052 E**.
- Curves are smoothly interpolated for render quality; the source control points are preserved in the GeoJSON.
- If a mapped OSM/swissTLM footpath overlaps a manually traced one, the map source takes precedence. Traced geometries are kept as a fallback and may also be used to animate a pedestrian on a documented visual path.

## Provenance and accuracy

**IMPORTANT: these are preliminary visual traces, not a precision survey.**

The source for `ycoor-traced-features.geojson` is the user's uploaded P0.5.6 screen recording from 14 November 2026. That recording showed swisstopo SWISSIMAGE draped over the 100 × 100 m pilot. The screen image was approximately orthorectified from the known Three.js camera orientation, orthographic projection and pilot bounds. Lines and surfaces were traced manually from the visible paths and colours.

Estimated positioning accuracy: **approximately ±3–6 metres**, potentially worse where trees, buildings or shadows obscure the image. The water shore and southern side paths are especially approximate. Traced path widths and styled materials are illustrative. The footprint/coordinates have NOT been certified by swisstopo, not surveyed on site, and cannot yet support navigation, engineering, accessibility compliance or cadastral use.

Only mapped playground equipment with coordinates from OSM is modelled; no particular slides/swings/climbing frames have been invented from visually ambiguous photography.

## Tests performed

- GitHub file existence verified: `index.html`, `ycoor-traced-features.geojson`, and this README.
- The main JavaScript parses successfully after removing the external imports for the static syntax check.
- GeoJSON type, WGS84 coordinate validity, geometry boundary and ring closure tested; 5 paths, 3 areas, no features outside the 100 × 100 m pilot.
- Verified in code: no SWISSIMAGE tile layer, no ground-photo module, no photographic toggle or raster-photo material. Three.js-only pixel-art geometry.
- Old P0.5.5 and P0.5.6 remain separate and unchanged.

## Pending validation

- GitHub Pages propagation and actual Chrome Android rendering not independently tested here.
- Compare the new path lines to a directly orthorectified SWISSIMAGE image with known scale and ground control points, then adjust GeoJSON coordinates for sub-metre accuracy where possible.
- Check whether the official pond shoreline and playground boundary can be obtained as survey-grade vectors, then replace the approximate manual outlines.
- Confirm pedestrian route clearance against the actual building footprints and geometry.
- Before expanding to P1, confirm true playground equipment locations and detailed paths from on-site verification or vectorized orthophoto.

## Attribution

© swisstopo, SWISSIMAGE reference and swissBUILDINGS3D / vegetation data (https://www.swisstopo.admin.ch/)
© OpenStreetMap contributors (ODbL) (https://www.openstreetmap.org/copyright)
Three.js (MIT); 3d-tiles-renderer (Apache-2.0); Pixelify Sans (SIL OFL).

Project note: **The photograph was used for interpretation but is not redistributed or displayed as a texture in P0.5.7.**
