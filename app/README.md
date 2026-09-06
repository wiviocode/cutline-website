<div align="center">

<img src="public/cutline-wordmark-onDark.png" width="300" alt="Cutline">

<br>

**Captions for sports photographs. In your browser.**

Point it at a folder, tell it who was playing, and it reads every frame, identifies players by
jersey number against a roster, writes the caption in your desk's house style, and files the
metadata into the photograph where Photo Mechanic can read it — with no server of ours in the
middle: the photographs go to the model you chose, and nowhere else.

</div>

---

This is the native macOS app, running as a web page. The photographs stay on your disk, the model
is called directly from the page with your own key, and the metadata is written back into the
JPEGs in place. Nothing about a shoot passes through a server of ours.

## Using it

Open the site in **Chrome, Edge, Brave or another Chromium browser** and drop a folder of
photographs on it. Safari and Firefox can open a folder read-only — caption, review, correct —
but cannot write into the files; the app says so when it detects one.

You need an [Anthropic API key](https://console.anthropic.com/). The first-time setup asks for it and
checks it before anything else, then your byline and house style, then the model and output. The key
is kept in the browser's own storage and is sent only to `api.anthropic.com`. Unlike the Mac app's keychain,
anything else running in that browser profile could read it — use a key you can revoke.

Every file format the app writes is the Mac app's: `.caption-data/<frame>.json`,
`.caption-manifest.json`, `.xmp` sidecars, and the embedded XMP and IPTC-IIM. A folder captioned
in one opens in the other.

## What it does

The model is asked for **observations, not prose**. It returns structured JSON — scene type,
players, jersey numbers and colours, a one-line summary — and is forbidden from writing anything
a reader would see. The caption is assembled here from that plus the roster and the fixture.

Two things follow from the split, and they are the reason for it:

* **A correction is free.** A jersey number typed in during review re-composes the caption
  locally, with no second API call.
* **Style is a function, not a prompt.** Seven house styles — AP, Getty, Getty (parenthetical),
  Imagn, Icon Sportswire, Hurrdat, and plain — each written the way that desk writes it.

Rosters come from a team's own web page: paste any link. A MaxPreps page is read from the data
it embeds, with no model and both of a two-way player's positions; any other page is reduced to
text and read by Haiku. A small relay at `/api/fetch` does the fetching, because a browser cannot
fetch another site for itself; when the relay is out of reach, paste the page's text instead. A
CSV works too. Teams are kept in a library so a squad is only ever read once a season, and both
sides can be read at once.

RAW files are shown through the JPEG preview the camera embedded, and their metadata goes to a
sidecar beside them.

## Developing

```bash
cd app
npm install
npm run dev        # http://localhost:5173/app/
npm test           # 159 checks, including a real JPEG written and read back
npm run build      # into ../dist/app
```

Set `CUTLINE_RAW_SAMPLE=/path/to/a.ARW` to run the RAW walker's check against a real file.

```
src/core/       pure TypeScript — every line has a test; no DOM, no network
src/platform/   the browser: File System Access, IndexedDB, image decoding, EXIF, the relay client
src/app/        React + zustand: the shell, the first-time setup, and the four screens (UI-PLAN.md)
../api/fetch.ts the relay, a Vercel function — at the repository root, where the host looks for it
tests/          the golden suite, ported check for check from the Mac app
```

`src/core` is the Swift app's metadata and caption layers moved language and nothing else. The
13 golden captions match byte for byte, the 28 Photo Mechanic variable cases pass, and a camera
JPEG round-trips with its scan data byte-identical — that last one on every test run, because
embedding rewrites the user's originals in place.

## Deploying

The repository root's `vercel.json` builds this folder into `dist/app` and serves it at `/app`,
and at `/`, the site's front door; the marketing page sits at `/about`. The relay is one serverless
function. Any host that serves
`dist/` works for everything except reading a team's page by link; without the relay the app
offers paste instead.
