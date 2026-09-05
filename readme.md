# Cutline Design System

Cutline is a free, open-source app that runs in the browser and captions sports photographs: drop a folder, pick the teams, and it identifies players by jersey number against a roster, writes the caption in the desk's house style, and files IPTC/XMP metadata into the photograph. Bring your own model — an Anthropic API key. Built for Nebraska D-I and high-school sports, general by design.

Audience: working sports photographers and photo desks. Verification culture: 910 checks, thirteen byte-for-byte "golden captions."

## Sources
- GitHub: https://github.com/wiviocode/cutline (branch main) — README.md, Tools/make-brand.swift (canonical brand numbers/colors), Sources/CaptionComposer/WireStyle.swift (house styles), Sources/CutlineApp/ReviewUI.swift + SetupUI.swift (app screens).
- This project's marketing site (Cutline.dc.html) and app-screen recreations (App Review.dc.html, App Setup.dc.html).
- This repository: https://github.com/wiviocode/cutline-website — the site, and the app under app/ (MIT).

## Products
1. **Marketing website** — dark, editorial one-pager (hero, caption demo, steps, review demo, open the app).
2. **The app** — served at /app from this repository's `app/` folder (Vite + React), with Setup and Review pages; dense, keyboard-first. The screen recreations here were drawn from the original macOS build, which the web app follows.

## CONTENT FUNDAMENTALS
- Voice: confident, punchy, dry-editorial. Short declaratives: "Shoot the game. Skip the typing." / "You stay the editor." / "Shoot. Drop. Done."
- Newsroom vocabulary used precisely: desk, house style, wire, cull, frame, card (memory card), file (verb), cutline itself ("**cut·line** · *noun* · the line of type beneath a photograph.").
- Second person for the photographer ("your desk's rules"); the app is "it." Never "we."
- Sentence case everywhere; headings end with periods. Mono strings are lowercase ("free — bring your own API key or local model").
- Numbers and specifics beat adjectives: "910 checks, all passing", "Seven house styles today; your own, soon."
- No emoji. No exclamation points. Honest hedging where warranted ("rests on observation rather than a published rule").
- Caption copy is always AP-real: team, position, name, (number), action, game clause, date, city, credit.

## VISUAL FOUNDATIONS
- **Ground**: near-black ink scale (#15181d page → #24282f chrome → #2a2f37 controls). Flat — solid fills, no gradients, no glass (a glass pass was tried and reverted). Sections separated by 1px hairlines (#23272e), alternating --ink-0 / --ink-1 panels.
- **Accent**: one gold, #e8b00a (hover #f2c235, text-on-gold #1e1700). Used sparingly: primary buttons, the active tab, the caption rule motif, focus/selection, key numerals. Second accent #4a525e (dim slate) exists only as the mark's second rule. Kit red #b3202c appears only as sports data (jersey/kit swatches).
- **Type**: Newsreader (serif, optical sizing) for headlines and set captions — medium weight, tight tracking (-0.02em..-0.025em), gold *italic* for the emphasized word. System sans for body/UI. Spline Sans Mono for meta: overlines, filenames, tokens, footnotes. Uppercase mono overlines at 10-13px with 0.05-0.14em tracking.
- **The rule motif**: the brand device is a photograph with a gold rule beneath it (the cutline) and a shorter dim rule below. Rules are rounded rectangles; the gold rule "draws in" (width 0 → full) with --ease-brand as an entrance.
- **Motion**: cubic-bezier(0.2, 0.7, 0.3, 1) everywhere; rise-in entrances (26px up, 0.7s, staggered ~0.1s); typewriter effect for captions with a blinking gold caret; animations run once (no loops) except deliberate cycling demos.
- **Hover**: buttons lighten (gold → #f2c235; controls #2a2f37 → #333944; borders may go gold); links #e8b00a → #f2c235; muted text lightens to #e9ecf0. Press states: none beyond hover.
- **Cards/wells**: --ink-1 or --ink-0 fill, 1px --ink-4 border, 12-14px radius. Framed windows (app frames, demo windows) add the one deep shadow (--shadow-window) and macOS traffic lights. No other shadows.
- **Layout**: 1160px max content, clamp() gutters, generous section padding (70-110px). App UI is dense: 44px title bar, 12.5px UI type, 300px right sidebar.
- **Imagery**: real action photos (placeholders: cool-gray gradients with a mono label until supplied). No illustrations.
- **Corner radii**: 6px app controls, 8px marketing buttons, 12px cards, 14px windows, pills for tabs/chips.
- **Transparency/blur**: only the sticky nav (rgba(21,24,29,0.85) + 14px blur). Nothing else.

## ICONOGRAPHY
- There is no icon set. The app and site use: the brand mark (assets/cutline-mark.svg), macOS traffic-light dots (drawn circles #ff5f57/#febc2e/#28c840), unicode glyphs as controls (‹ › ← → ⏎ ✓ ·), kbd-style mono key chips, and colored squares as kit-color swatches. One drawn-glyph exception: a gear glyph in the app's Settings button (recreated as inline SVG in the app kit). Keep it that way — no icon font, no emoji. The mark is generated from Tools/make-brand.swift; never redraw it by hand.
- Logo files: assets/cutline-mark.svg (vector mark), cutline-mark-256.png, cutline-wordmark-onDark.png (mark + name for dark grounds; a light-ground wordmark exists in the repo as cutline-wordmark.png), cutline-banner.png (1280×640 social).

## Index
- styles.css — global entry; imports tokens/*.css
- tokens/ — colors, typography, spacing, effects, fonts
- assets/ — mark SVG/PNG, wordmark (dark ground), banner
- guidelines/ — foundation specimen cards (Design System tab)
- components/core/ — Button, PillTab, KeyChip, KitChip, Overline, WindowFrame
- components/forms/ — TextInput, TextArea, Segmented
- ui_kits/website/ — marketing one-pager recreation
- ui_kits/app/ — Review screen recreation
- Cutline.dc.html — the live marketing site design (source of the website kit)
- App Review.dc.html / App Setup.dc.html — app screen recreations
- github.md — repo link + sync state
- SKILL.md — agent skill entry point

## Intentional additions
- Component primitives (Button, inputs, chips, tabs, window frame) are distilled from the site + app recreations — the Swift repo defines no web component library. Values are copied verbatim from those files, not invented.

## Caveats
- Fonts load from Google Fonts (no binaries in the repo). Newsreader + Spline Sans Mono are the site's actual faces; the app uses the system stack.
- No light-theme tokens: the brand is dark-ground only (the repo's light wordmark exists for READMEs, not product UI).
