<div align="center">

<img src="docs/cutline-mark-256.png" width="80" alt="">

# Cutline

**Captions for sports photographs. In your browser.**

[cutline.photo](https://cutline.photo) · [Open the app](https://cutline.photo/app)

</div>

---

Drop in a folder of photographs and tell it who was playing. Cutline reads every frame, names
the players by jersey number against a roster, writes the caption in your desk's house style,
and files the metadata into the photograph where Photo Mechanic and every wire ingest can read
it. No server of ours is in the middle: the photographs go to the model you chose, and nowhere else.

Nothing to install. It runs as a web page, calls the model with your own key, and writes the
metadata back into the JPEGs in place.

## Using it

1. Open **[cutline.photo/app](https://cutline.photo/app)** in Chrome, Edge, Brave or another
   Chromium browser. Safari and Firefox can open a folder read-only — caption, review, correct —
   but cannot write into the files, and the app says so.
2. Add an [Anthropic API key](https://console.anthropic.com/). The first-time setup asks for it,
   checks it, and asks for your byline and house style. The key is kept in the browser's own
   storage on this site and is sent to nothing but `api.anthropic.com`.
3. Drop a folder. Pick the level, sport, and the two teams — a roster comes from any team page
   link, a pasted page, a CSV, or your library. Continue.
4. **Caption photos**, then review: arrow keys move, Return approves, a click on a number corrects
   it and the caption rewrites itself without a second request.

## How it works

The model is asked for **observations, not prose**: the scene, the players, their numbers and
kit colours, one line on what is happening. It is forbidden from writing anything a reader sees.
The caption is assembled here from those observations, the roster, and the fixture.

Two things follow from that split, and they are the reason for it:

- **A correction is free.** A jersey number typed in during review recomposes the caption
  locally. No second call, no wait.
- **Style is a function, not a prompt.** Seven house styles — AP, Getty, Getty (parenthetical),
  Imagn, Icon Sportswire, Hurrdat, and plain — each written the way that desk writes it, with
  its own date form, state form, and credit line.

Rosters are read from a team's own web page by a small relay, because a browser cannot fetch
another site for itself. A MaxPreps page is read from the data it embeds — instant, and no model
involved — with both of a two-way player's positions, so a caption names the linebacker making the
tackle and the running back carrying the ball as the same player. Other sites are reduced to text
and read by Haiku for about a cent. Teams are kept in a library so a squad is read once a season. RAW files
are shown through the JPEG preview the camera embedded, and their metadata goes to a sidecar
beside them.

**What it writes** is the same on-disk format as the original macOS app: an XMP packet and a
legacy IPTC-IIM block embedded by segment surgery, so EXIF, maker notes, thumbnail and scan data
stay byte-identical; `.xmp` sidecars for RAW and PNG; a `.caption-data/` folder of per-frame
records; a `.caption-manifest.json` so a second run never captions a frame twice. A desk's
standing fields — credit, copyright, source, contact — come from an IPTC template made in the
setup, or from a Photo Mechanic `.XMP` stationery pad, `{token:modifier}` variables included.

## This repository

| Path | What it is |
|---|---|
| `Cutline.dc.html`, `support.js`, `docs/` | The marketing page, at `/about`. A [Claude Design](https://claude.ai/design) document and its runtime. |
| `app/` | The app at `/app`. Vite, React, TypeScript. Its own [README](app/README.md) covers the code. |
| `api/fetch.ts` | The relay: reads a public web page for the roster importer. Answers only the app, resolves a name before reading it and refuses anything private, follows a redirect only where it would have gone itself, returns only text or a sandboxed image, sixty reads per caller per ten minutes. A Vercel function. |
| `scripts/build-site.mjs`, `vercel.json` | One build: the site copied to `dist/`, the app built to `dist/app`. |
| `DESIGN.md`, `tokens/`, `components/`, `guidelines/`, `ui_kits/` | The brand and design system the site and app are drawn from. |

Inside `app/`, `src/core` is pure TypeScript with a test for every line — the metadata and
caption layers of the Swift app, moved language and nothing else. `src/platform` is the browser:
File System Access, IndexedDB, image decoding, EXIF, the relay client. `src/app` is the interface.

## Developing

```bash
cd app
npm install
npm run dev        # http://localhost:5173/app/
npm test           # the golden suite: 159 checks, including a real JPEG written and read back
```

From the repository root, `npm run build` does what the host does: installs and builds the app,
then assembles `dist/`. Any static host that serves `dist/` runs everything except reading a
team's page by link; without the relay the app offers paste instead.

## Privacy

No server of ours sees a photograph, a caption, or a key. The model is called from the page.
The relay fetches public pages and returns their text; it sends no cookies and keeps nothing.
Settings, teams, and recent shoots live in the browser's IndexedDB on `cutline.photo`.

## Licence

[MIT](LICENSE). *cut·line* · *noun* · the line of type beneath a photograph.
