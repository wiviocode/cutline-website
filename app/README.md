<div align="center">

<img src="public/cutline-wordmark-onDark.png" width="300" alt="Cutline">

<br>

**Captions for college and high-school sports photographs. In your browser.**

</div>

---

Drop in a folder of photographs and add the two rosters. Cutline reads every frame, names the
players by jersey number, writes the caption in your desk's house style and files it into the
photograph where Photo Mechanic and every wire ingest can read it. The photographs go from your
browser to Anthropic with your own key, and nowhere else.

Built for the six team sports a college or high-school desk shoots most — football, basketball,
volleyball, soccer, baseball and softball — plus track and field and cross country, which have no
rosters and are captioned by meet, bib and school.

## How a photograph is read

1. **One look at the frame.** Claude gets the photograph, both rosters, and a line on what each
   team is wearing today (read from a few of your frames before the run). It reports each subject
   — team, the digits it can actually see and where it saw them, how clearly, any nameplate — and
   one caption clause written with tokens: `{P1} catches a pass over {P2}`.
2. **Identities are checked in code.** A name is believed only when the digits and the team agree
   with the roster. A number football's two units share is settled by the nameplate, then the
   play. A partly hidden number (`1?`) names a player only when one roster number fits.
   Everything is sorted into *sure*, *check* and *unnamed*.
3. **A close look where it pays.** A number left unsettled — or read "clearly" on a distant player
   — is checked against a crop of the original at full resolution. About one frame in three.
4. **The caption is composed locally** in AP, Hurrdat, Getty, Imagn, Icon or simple style. A
   correction in review re-renders it instantly, with no second request.

Optional, off by default: **face matching** against college roster headshots, entirely on the
device. It never overrules a number that was read; it can name an athlete whose number is hidden
(marked *check*) and settles a partial read it agrees with.

## Accuracy and cost

Measured on 35 hand-checked frames from six real shoots (college and high-school football,
volleyball and soccer), scoring the names that reach the caption:

| Tier | Model | Precision | Recall | Wrong and unflagged | per 1,000 photos |
|---|---|---|---|---|---|
| Economy | Sonnet 5, standard resolution + close looks | 93% | 90% | 2 | about $7.40 |
| **Balanced** (default) | Opus 5.5, 2400 visual tokens + close looks | **100%** | **93%** | **0** | about $20 |
| Best | Opus 5.5, full resolution + close looks | 100% | 93% | 0 | about $30 |

For comparison, Haiku 4.5 scored 60% precision and 64% recall on the same frames, with 16 wrong
names marked sure — it is used here only for text (reading a roster page, naming a team). The
frame is sized to exactly what the model reads, so pixel boxes map back onto the original and
nothing is paid for that would be thrown away; the system prompt with both rosters is cached, so
after the first frame each photograph pays a tenth for it.

## Rosters

Paste a team's athletics home page, its roster page, or a MaxPreps team page:

- **MaxPreps** (high school), **Sidearm** (both generations — most of Division I) and **WMT**
  (Nebraska and others) are read exactly from the data the page embeds: instant, free, with
  headshots on the college platforms and both positions of a two-way player.
- Any other page, pasted text, a screenshot or a PDF is read by Claude for about a cent.
- A CSV works too. Teams are saved so a roster is read once a season.

The small relay at `../api/fetch.ts` reads the page (a browser cannot read another site). It
answers only this app, reads only public addresses, slims a page to its data, and returns only
text or a sandboxed image.

## What it writes

The same on-disk formats as the first Cutline and the macOS app: an XMP packet and the legacy
IPTC-IIM block embedded by JPEG segment surgery (EXIF, maker notes and scan data byte-identical),
`.xmp` sidecars for RAW files, a `.caption-data/<frame>.json` record of each reading and every
correction, and `.caption-manifest.json`. Reopening a folder restores every reading for free.
Captions written by the first Cutline are kept and can be read again.

## Developing

```bash
cd app
npm install
npm run dev        # http://localhost:5173/app/
npm test           # 149 checks, including a camera JPEG written and read back
npm run build      # into ../dist/app
```

```
src/core/       pure TypeScript: sports, rosters, the reading, identities, captions, metadata
src/platform/   the browser: folders, IndexedDB, image decoding, EXIF, the relay, face matching
src/app/        React + zustand: welcome, setup, review, settings
scripts/        the evaluation harness (eval.ts, score.ts)
tests/          vitest
```

### Measuring accuracy

`scripts/eval.ts` runs the app's pipeline under Node over folders of photographs and scores the
named players against a truth file (`"A13"` team and number, `"B0:Scoby"` a specific player,
`"+A9"` visible and allowed, `"A?"` unreadable). It keeps a spend ledger beside the config and
refuses a run that would pass `--budget`.

```bash
ANTHROPIC_API_KEY=… npx tsx scripts/eval.ts --config eval.json --truth-only --tier balanced
npx tsx scripts/score.ts truth.json runs/*.json
```
