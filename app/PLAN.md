# Cutline for the browser — the plan

Cutline runs as a native macOS app. This is the same app, running entirely inside a browser
tab: the photographs stay on the photographer's machine, the model is called directly from the
page with the photographer's own key, and the metadata is written back into the JPEGs on disk.
Nothing about a shoot passes through a server of ours.

The scope is [SCOPE.md](../CaptionComposer/SCOPE.md): 56 features kept, 10 cut. Everything kept
is here, with the handful of browser-shaped substitutions listed under *What changes*.

## Why this is possible at all

Three browser capabilities carry the whole thing, and each maps onto a part of the app that was
already written to be independent of AppKit:

| Native | Browser | Notes |
|---|---|---|
| `FileManager` + folder picker | **File System Access API** (`showDirectoryPicker`, `createWritable`) | Chromium-based browsers only. Writes go to a temp file and are swapped in on `close()`, so an interrupted write cannot truncate a photograph. |
| `URLSession` → `api.anthropic.com` | **`@anthropic-ai/sdk`** in the page, `dangerouslyAllowBrowser: true` | Anthropic's API serves CORS. The key lives in the browser's IndexedDB, never in a URL or a cookie. |
| JPEG segment surgery (`Data`) | The same algorithm over **`Uint8Array`** | Pure byte manipulation. No ImageIO was ever involved in the write path — that is the whole reason it works here. |
| ImageIO decode + downscale | `createImageBitmap` + `OffscreenCanvas` | Honours EXIF orientation with `imageOrientation: "from-image"`. |
| ImageIO EXIF | `exifr` | Reads JPEG, and the TIFF-based RAWs (ARW, NEF, CR2, DNG). |
| Keychain | IndexedDB | Weaker: anything running in the browser profile can read it. Said plainly in Settings. |
| `Application Support` (teams, recents, logos) | IndexedDB | |
| `WKWebView` headless page render | *dropped* | The third roster-import tier. The first two (page text, embedded JSON) cover every site tried. |
| Fetching a roster page | A 20-line relay at `/api/fetch` | The one thing a page cannot do for itself is fetch another site. The relay returns text only, caps size, and holds nothing. Pasting the page's text works without it. |

## What changes

* **Chromium only for writing.** Safari and Firefox have no writable directory access. They can
  open a folder read-only (`<input webkitdirectory>`), caption, review, and *download* a zip of
  sidecars — but cannot write into the originals. The app detects this and says so up front.
* **RAW files are shown through their embedded preview.** Browsers cannot decode ARW/NEF/CR2.
  `RAWPreviewExtractor` (already written for the native app's ingest path) walks the TIFF IFDs
  and pulls the full-size JPEG the camera embedded. It is the display image *and* what the model
  sees. Metadata for a RAW goes to a sidecar beside it, exactly as before.
* **No immutable-flag handling.** There is no `uchg` in a browser file handle.
* **Rename is copy-then-delete**, staged through temporary names in two phases as before.
  `FileSystemFileHandle.move()` is not yet reliable outside the origin-private file system.
* **The same on-disk formats.** `.caption-data/<stem>.json`, `.caption-manifest.json`, `.xmp`
  sidecars, and the embedded XMP/IIM are byte-compatible with the native app. A folder captioned
  in one opens in the other.

## Architecture

```
src/core/          pure TypeScript, no DOM, no network — every line here has a test
  caption/         CaptionComposer, WireStyle, WireDate, USState, TeamNoun, SceneFallback,
                   PlayerReference, Cleanup, PrependComposer, SampleCaption, CaptionParts
  roster/          Roster, RosterMatcher, TeamColorArbiter, RosterImporter (text→rows),
                   CSVRosterImporter, TeamPageURL, TeamPageParser, TeamIdentity, TeamName
  vision/          VisionResult, the prompt, CaptionResponseParser
  metadata/        JPEGSegments, IPTCIIM, XMPToIIM, XMPFieldWriter, IPTCTemplate,
                   PMVariables, XMPSidecar, HurrdatFields, EmbeddedMetadataWriter,
                   MetadataOutput
  images/          SupportedFormats, PhotoMetadata, RAWPreviewExtractor
  naming/          HDSNaming, NamingPattern, PhotoRenamer (planning)
  setup/           Level, Gender, RosterMode, SportCatalogue, GameSelection, RecentGame,
                   KitColourDiagnosis
  anthropic/       AnthropicClient (SDK-backed), RetryPolicy, VisionModel, AltTextMode,
                   AltTextRequest, SimpleAltText
  records/         CaptionRecord, ProcessedFilesManifest

src/platform/      the browser — the only code that touches the DOM, disk or network
  fs.ts            directory picker, listing, read, atomic write, staged rename
  storage.ts       IndexedDB: settings, key, teams, logos, recents, templates
  images.ts        thumbnails and vision-sized JPEGs from a File; RAW via preview
  exif.ts          exifr → PhotoMetadata
  fetchPage.ts     the relay, and the paste fallback

src/app/           React 19 + zustand, the design system's tokens and components
  store.ts         ShootModel + GameSetup, one store
  screens/         Setup, Review, Settings, Rename
  components/      Button, PillTab, KeyChip, KitChip, Overline, Segmented, TextInput, TextArea

api/fetch.ts       Vercel function: GET ?url= → {text, contentType}, 2 MB cap, http(s) only
tests/             vitest — the golden suite, ported check for check
```

`core/` is the contract. It is the Swift code, moved language and nothing else: the 13 golden
captions must still match byte for byte, the Photo Mechanic golden cases must still pass, and a
JPEG must round-trip with its scan data untouched. Those tests come first, before any UI.

## Order of work

1. **Metadata.** Segment surgery, IIM, XMP, templates, PM variables. Round-trip on a real
   camera JPEG in the test suite. *If this does not hold, nothing else matters.*
2. **Caption core.** Roster, matcher, arbiter, composer, house styles. The 13 golden captions.
3. **Everything else pure.** Naming, setup rules, records, retry policy, alt text, RAW previews.
4. **Platform.** File system, IndexedDB, thumbnails, EXIF, the relay.
5. **App.** Store, then the four screens on the design system.
6. **Ship.** Repo, Vercel, a link from the marketing site.

## Not in this pass

* Folder watching, bulk edit, multi-select, the CLIs, ESPN, PM short codes — cut in SCOPE.md.
* A service worker for an offline shell. The app works offline for review once loaded; a
  service worker would make it *load* offline. Worth adding, separately.
* Safari/Firefox write support. Waits on the platforms.
