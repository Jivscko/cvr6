# Cover Snap

A GTA-style cover art maker for the make.fun `gta6-cover-art-01` bounty. Drop in
your photos, type a caption, and get a Vice City-style multi-panel poster —
sunset/neon colour grade, bold condensed lettering, white collage seams —
exported as a PNG. Original design; no Rockstar artwork, logos or game fonts.

Everything runs offline in the browser: plain static files under `app/`, ES
modules with relative imports, vendored fonts (Anton + Archivo Black, SIL OFL)
and two sample photos. Photos never leave the device — uploads become object
URLs and exports are local `canvas.toBlob` downloads.

## Features

- Three poster layouts: 2 × 2 grid, 3 vertical strips, 1 big + 2 small.
- Per-panel framing: drag to reposition, scroll to zoom (zooms toward the
  cursor), double-click or arrow keys / `+` `-` to adjust; zoom slider too.
- Fill every panel from one photo, or spread several photos across panels.
- Live caption + tagline editing (Anton for the title, Archivo Black for the
  tagline), adjustable sunset overlay and saturation.
- Export PNG in 1080 × 1080, 1080 × 1350 or 1920 × 1080 with a download link.
- "Load sample photos" button for an instant demo; optional deep links like
  `?photo=both&caption=VICE%20NIGHTS&layout=hero&size=wide`.

## Run it

```sh
node serve.ts          # Node 22, no dependencies
# open http://localhost:8080
```

Or serve `app/` with any static server (e.g. `python3 -m http.server -d app`).

## Hand it in

```sh
MAKEFUN_OUTPUT_DIR=/output node main.ts
```

`main.ts` copies `app/` and `screenshots/` to the output directory and writes
`dossier.json` using the vendored `vendor/makefun-app.ts` (kept unchanged) with
the bounty's caps. Outside the grader, point `MAKEFUN_OUTPUT_DIR` anywhere:

```sh
MAKEFUN_OUTPUT_DIR=/tmp/cvrout node main.ts
```

## Screenshots

`shot.py` (Playwright + Pillow) serves `app/`, loads the sample photos through
the file input, exercises the editor, captures the UI and the actual exported
PNGs, and enforces the dossier limits (≤ 4 images, ≤ 256 KiB each, long side
≤ 1280, short side ≥ 480). The first image by name is the exported cover.

## License

MIT — see `LICENSE`. Bundled fonts are SIL OFL (licenses in `app/fonts/`).
Sample photos in `app/samples/` were made for make.fun and are free to use.
