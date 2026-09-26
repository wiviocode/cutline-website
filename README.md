<div align="center">

<img src="docs/cutline-mark-256.png" width="80" alt="">

# Cutline

**Captions for college and high-school sports photographs. In your browser.**

[cutline.photo](https://cutline.photo) · [Open the app](https://cutline.photo/app)

</div>

---

Drop in a folder of photographs and tell it who was playing. Cutline reads every frame, names
the players by jersey number against a roster, writes the caption in your desk's house style,
and files the metadata into the photograph where Photo Mechanic and every wire ingest can read
it. No server of ours is in the middle: the photographs go from your browser to Anthropic, with
your own key, and nowhere else.

Nothing to install. It runs as a web page, calls the model with your own key, and writes the
metadata back into the JPEGs in place.

## Using it

1. Open **[cutline.photo/app](https://cutline.photo/app)** in Chrome, Edge, Brave or another
   Chromium browser. Safari and Firefox can open a folder read-only — caption, review, correct —
   but cannot write into the files, and the app says so.
2. Paste an [Anthropic](https://console.anthropic.com/settings/keys) API key of your own. The
   first-time setup checks it and asks for your byline and house style. The key is kept in the
   browser's own storage on this site and is sent to nothing but Anthropic's API.
3. Drop a folder. The level, sport, teams and venue are filled in from what the photographs
   already say where they can be; add each roster from its athletics site or MaxPreps page.
4. Choose a tier — Economy (about $7 per 1,000 photographs), Balanced (about $20, the default) or
   Best — and **Caption photos**. Then review: arrow keys move, Return approves and writes the
   file, a click on a player corrects them and the caption rewrites itself without a second request.

## How it works

The model reports who is in the frame — each subject's team, the digits it can actually see and
where, how clearly, any nameplate — and one caption clause written with tokens rather than names:
`{P1} catches a pass over {P2}`. The rosters and today's uniforms are in its prompt, but a name
is believed only when the digits and the team agree with the roster, checked in code; a number
left unsettled is checked again on a full-resolution crop. On 35 hand-checked frames from six
real shoots the default tier named 93% of the players with no wrong names. The details and the
measurements are in [app/README.md](app/README.md).

Two things follow from composing the caption here rather than asking for it:

- **A correction is free.** A player corrected during review recomposes the caption locally.
  No second call, no wait.
- **Style is a function, not a prompt.** Seven house styles — AP, Getty, Getty (parenthetical),
  Imagn, Icon Sportswire, Hurrdat, and plain — each written the way that desk writes it, with
  its own date form, state form, and credit line.

Six team sports in depth — football, basketball, volleyball, soccer, baseball and softball — at
college and high-school level, plus track and field and cross country, captioned by meet, bib and
school without rosters.

Rosters are read from a team's own web page by a small relay, because a browser cannot fetch
another site for itself. MaxPreps, Sidearm and WMT pages — nearly every high-school and college
roster — are read from the data they embed: instant, free, with headshots on the college sites
and both of a two-way player's positions. Other pages, screenshots and PDFs are read by Claude
for about a cent. Optional face matching against college headshots runs entirely on the device. Teams are kept in a library so a squad is read once a season. RAW files
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
| `api/fetch.ts` | The relay: reads a public web page for the roster importer. Answers only the app, resolves a name before reading it and refuses anything private, follows a redirect only where it would have gone itself, slims a page to its data, returns only text or a sandboxed image, sixty pages and six hundred images per caller per ten minutes. A Vercel function. |
| `scripts/build-site.mjs`, `vercel.json` | One build: the site copied to `dist/`, the app built to `dist/app`. |
| `DESIGN.md`, `tokens/`, `components/`, `guidelines/`, `ui_kits/` | The brand and design system the site and app are drawn from. |

Inside `app/`, `src/core` is pure TypeScript — sports, rosters, the reading of a photograph,
identities, captions, and the metadata layer carried over byte for byte from the Swift app.
`src/platform` is the browser: File System Access, IndexedDB, image decoding, EXIF, the relay
client, face matching. `src/app` is the interface. `scripts/` is the evaluation harness.

## Developing

```bash
cd app
npm install
npm run dev        # http://localhost:5173/app/
npm test           # 144 checks, including a real JPEG written and read back
```

From the repository root, `npm run build` does what the host does: installs and builds the app,
then assembles `dist/`. Any static host that serves `dist/` runs everything except reading a
team's page by link; without the relay the app offers paste instead.

## Privacy

No server of ours sees a photograph, a caption, or a key. Claude is called from the page; face
matching, when it is on, runs in the page and sends no face anywhere.
The relay fetches public pages and returns their text; it sends no cookies and keeps nothing.
Settings, teams, and recent shoots live in the browser's IndexedDB on `cutline.photo`.

## Licence

[MIT](LICENSE). *cut·line* · *noun* · the line of type beneath a photograph.
