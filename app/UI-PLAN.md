# The interface, rebuilt from the ground

Written 2026-09-05, before the code. The brief: strip the interface to the bone, rebuild it so
it has no errors or glitches, make it streamlined and easy, and give a first-time user a setup
that collects everything the app needs before they start.

Nothing under `src/core` or `src/platform` changes in what it does. The 152 checks stay green
throughout; two are added.

## What was wrong with the old one

Read from the code, not guessed:

- **Nothing collected the essentials up front.** The API key lived on the second tab of a
  Settings sheet, behind a gear. Photographer name (the credit line) sat on the first tab. A new
  user met a dark drop zone and a disabled button.
- **Whole-store subscriptions everywhere.** Every screen called `useStore()` with no selector,
  so every frame update during a run re-rendered the entire tree — including a filmstrip of
  hundreds of thumbnails, none memoised.
- **The three setup thumbnails flickered.** Their effect keyed on `frames`, which changes on
  every progress tick, and it cleared the URL map each time.
- **A component defined inside render** (`Why` in Settings) remounted its buttons every render.
- **Errors opened a modal.** A failed write or a bad key became a blocking "Something went
  wrong" sheet in the middle of review.
- **Stop did not stop.** Cancel bumped a generation counter, but the in-flight requests kept
  running to completion; the abort controller was created and never passed to the client.
- **Return approved a frame whenever focus was on a button** — pressing Stop and then Return
  approved the frame under review.
- **Fixed heights that clip.** Bars were 46px with `overflow: hidden`; the rail was a hard
  300px; narrow windows lost buttons and the stage.
- **A no-op expression** in the team editor's crest colour (`(derive.nameParts(s, side), st.colour)`).
- **Settings behind tabs** with "why" toggles: three surfaces for eleven values.

## The shape of the new one

Four screens in a straight line, one sheet for settings, two small sheets for a team and for
renaming. Nothing is more than one click from where it is needed.

```
Welcome (first run)  →  Start  →  Game  →  Review
   key · byline · model      folder     who played     caption, correct, approve
```

### Welcome — the first-time setup

Shown when the app has never been set up, or when there is no key. Three steps, one screen
each, with a progress rail. The user cannot reach the app without a key that has been checked.

1. **Your key.** One field. A **Check key** button makes the free `models.list` call and
   reports plainly: works, or the exact reason it does not (401 "not a valid key", network).
   A line on where the key lives (this browser, this site, sent to nothing but
   api.anthropic.com) and a link to get one. If the browser cannot write into files, it says so
   here, before any work is done, with the two browsers that can.
2. **Your byline.** Photographer name, and the house style as a list of radio rows, each
   showing the real sample caption it produces. This is what makes a caption read as AP or
   Getty; it belongs at the start, not in a tab.
3. **Model and output.** Which model reads the photographs (three cards: capability, speed,
   list price per million tokens), whether captions are written into the photographs (on when
   the browser can), and alt text. **Finish** marks the app as set up.

Settings keeps a "Run the setup again" link so it is never a one-way door.

### Start

The drop zone, the browser note if it applies, recent shoots. Nothing else.

### Game

One scrolling page, no numbered steps:

- **Photographs** — folder, count, capture date, Change.
- **What was played** — level, sport, gender, and how much team information there is.
- **Who played** — two team cards (name, kit colour, roster) opening the team sheet, or the
  event fields for an open event.
- **Where** — venue, city, state, and notes to the model.
- A footer that says in words what is still missing, then **Continue**.

### Review

- Header: back, the matchup, the filter (needs review / approved / all) and position, and the
  "next unread number" jump when there is one.
- The stage (click to zoom at the click point) and the rail: the caption (click to edit),
  numbers read as chips (click to correct — recomposed locally, no request), redo with a note,
  alt text, approve.
- The filmstrip, memoised per thumbnail.
- The action bar: **Caption N photos** / **Stop**, Test 10, Redo all, Rename…, live cost.
- The kit-colour alarm, when it fires, above the stage.

Below 880px the rail moves under the stage, and the bars wrap rather than clip.

### Settings

One scrolling sheet, sections in the order a person needs them: key, byline and style, model,
output, file names, and the setup link. No tabs. Explanations sit under their control, always
visible, one line each.

## How the glitches go away

- **An error boundary** around the app: a render error shows a message and a Reload button
  instead of a blank page.
- **Notices, not modals.** Errors and confirmations are a toast at the bottom, dismissed by a
  click or on their own.
- **One shortcut hook.** Shortcuts are declared per screen, ignored while a sheet is open or
  when focus is in an input, textarea, select or button. Return approves only from the stage.
- **Selectors.** Hot components subscribe to the slice they draw; `Thumb` is `memo`ised and
  subscribes to nothing but its own frame's four booleans.
- **Stable thumbnails.** The setup preview keys on the folder, not on the frame list.
- **Abort that aborts.** The run's `AbortSignal` goes into every request; Stop cancels what is in
  flight and marks those frames pending again.
- **Layout that bends.** Bars are `min-height` and wrap; the rail has a media query; the stage is
  `min-width: 0`. No `overflow: hidden` on a bar.
- **Class-based primitives.** Buttons, inputs and selects are CSS classes, not per-instance
  hover state, so nothing re-renders to change a colour.

## Order of work

1. `AnthropicClient`: accept `signal`; add `verifyKey()`. Test against the fake server.
2. `Settings.onboarded`; store: `screen` becomes `welcome | start | game | review`; `notice`
   replaces `lastError`; `verifyKey`, `finishOnboarding`; abort wired.
3. `onboarding.ts` (pure): which step is next, key-format check. Test.
4. Primitives and stylesheet, rewritten.
5. Screens: Welcome, Start, Game, Review, Settings, Team, Rename. App shell with the boundary,
   shortcuts and toast.
6. `tsc`, the test suite, `vite build`; then a walk through every screen in the browser at two
   widths, with the console open, before it ships.

## What was checked before it shipped

Same day, in Chromium at 1280 and at 800 pixels wide, with the console open:

- **Welcome.** A malformed key is refused before any request; a well-formed wrong key gets
  Anthropic's 401 reported in words; Continue stays off until a key is saved. The style cards
  show real sample captions that change with the photographer's name. The model cards show
  list prices. The write switch is on because the browser can write. Finish lands on Start.
- **Start → Game.** Three photographs seeded; the folder row reads the capture date; the
  footer names the missing answer and turns to Ready when it is given. The team sheet takes
  focus, sets name and colour, and closes on Escape. The open-event fields work.
- **Review.** Arrows move, space zooms, `e` opens the editor with focus and arrows are ignored
  while it is open, Escape closes it, Return approves and advances with the counts updating.
  A run with a rejected key fails every frame with the HTTP reason, marks the thumbnails, and
  ends with "Done — 0 captioned, 3 failed". Settings and Rename open, take focus, and close on
  Escape. At 800px the rail sits under the stage and nothing scrolls sideways.
- **Back and out.** ‹ Game keeps every field; Start over clears the fixture and lists the
  shoot under Recent; "Run it again" in Settings reopens Welcome on the byline step.
- Zero console errors from the app. `tsc` clean, 159 checks passing, `vite build` clean.

## Second pass on Review

Same day, after the first walk-through, on the brief "streamline it more":

- **The header is the matchup, the filter and the position.** The house style and the
  sport-and-venue line were settings and context, not review; they are gone.
- **A fresh shoot opens with a card on the photograph:** "N photographs ready. <Model> reads
  each one, and the caption is written into the file as it comes back. Caption them." — with
  "Try 10 first" when there are more than ten. The card leaves the moment anything has run.
- **The rail shows a block only when it has something.** No "Numbers read · none read" on an
  uncaptioned frame. "Redo with a note to the model…" replaces the longer sentence. The state
  line says "Written into the photograph" and no more.
- **The bar has one primary action.** "Caption N photographs" while there is work; "Retry N
  failed" when only failures remain (a new `run({ failed })`); nothing when all is done.
  "Redo every caption…" and "Rename photographs…" sit under **More ▾**.
- Buttons here let go of focus after a click, so Return always means approve.

Checked in the browser: the card on a fresh shoot; seeded records showing chips, a flagged
number corrected through the pop and the caption rebuilt locally; the note-redo editor; the
More menu, Escape, and the rename sheet from it; Retry on a failed frame ending in "Done — 0
captioned, 1 failed"; zero console errors from the app.

Also corrected while here: four places said the photographs never leave your machine. They do
leave it — resized copies go to Anthropic to be read. The copy now says what is true: no server
of ours is in the middle; the photographs go to the model you chose, and nowhere else.

## Streamlined further, after a run on a real key

- The review header carries the matchup, the filter and the position — the house style and the
  venue are gone from it; they are settings and setup, not review.
- A fresh shoot opens with one card on the photograph: "N photographs ready · Caption them".
  It disappears the moment anything has run.
- The rail hides "Numbers read" until there is a record with players in it, says "Redo with a
  note to the model…", and "Written into the photograph" instead of naming the blocks.
- The action bar has one primary button — Caption N, or Retry N failed when a run left
  failures — and a **More** menu for Redo every caption and Rename photographs. Nothing
  disabled sits in it.
- Two defects the real run exposed are fixed: a scene the model could not place (a portrait)
  produced a sentence with no subject, and now reads "A Nebraska Cornhuskers player poses…"
  when a team's colour is in frame; and the cost estimate ignored cached prompt tokens, which
  understated a cached run several times over.
- Four claims that the photographs "never leave your machine" were false — resized copies go to
  the model — and now say that no server of ours is in the middle.

## From a real game: Ashland-Greenwood v Syracuse, six frames, two rosters

Run on the photographer's own key, Sonnet 5 at 1616 px, both rosters read from MaxPreps links.

- **Roster import.** Haiku 4.5 read each team from MaxPreps' embedded data (the visible text is
  an empty shell): Syracuse, 38 players, 34,411 tokens, four cents; Ashland-Greenwood, 57 players.
  School, mascot, colours, logo and gender all came from the page. The status line now says so.
- **Captions.** Six frames in eleven seconds for eight cents, cache included. 31 became Grayson
  Nolan, 73 Peyton Groteluschen, 6 Rogan Cerveny; two Rockets in white were XXXXX because the
  import had overwritten the typed kit colour with the school's green.
- **Fixed from it.** A colour the photographer typed is never overwritten by an import. A frame
  whose numbered jersey matched neither team says so in the rail, with the two one-click fixes;
  the shoot-wide alarm still waits for a pattern. "A Ashland-Greenwood coach" became "An". Alt
  text uses the model's own phrase for a scene. Returning from the game screen recomposes every
  caption for free, writes nothing that did not change, and leaves hand edits alone. The stage
  shows the thumbnail while a 27 MB frame decodes. File codes read AG_v_SYR.

