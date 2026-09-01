<div align="center">

<img src="https://raw.githubusercontent.com/wiviocode/cutline/main/docs/cutline-mark.png" width="40" alt="">

**cut·line** · *noun* · the line of type beneath a photograph.<br>
A picture, and the rule under it — which is the mark.

</div>

---

# Cutline Website Design & Design System

The design system and marketing website for **Cutline**, a free, open-source macOS app that captions sports photographs.

Built to mimic the confident, punchy, dry-editorial tone of the app, utilizing a near-black ink scale with gold accents, and a focus on Newsroom vocabulary.

---

## What it does

**1 · Marketing website.** A dark, editorial one-pager featuring a hero section, an interactive caption demo, the five-step process, a review demo, and download links.

**2 · App screen recreations.** Pixel-perfect web recreations of the macOS app's WKWebView-rendered Setup and Review pages, demonstrating the dense, keyboard-first layout.

**3 · Component library.** A set of primitives (Buttons, PillTabs, KeyChips, KitChips, WindowFrames) distilled from the site and app recreations, giving the design system a solid foundation.

**4 · Design tokens & guidelines.** Comprehensive definitions for colors, typography, spacing, and motion, capturing the brand's flat, shadowless aesthetic (except for window drop-shadows) and cubic-bezier rise-in animations.

---

## Visual Foundations

- **Ground**: near-black ink scale (`#15181d` page → `#24282f` chrome → `#2a2f37` controls). Flat — solid fills, no gradients, no glass.
- **Accent**: one gold, `#e8b00a`. Used sparingly for primary buttons, active tabs, the caption rule motif, focus/selection, and key numerals.
- **Type**: Newsreader (serif) for headlines and set captions. System sans for body/UI. Spline Sans Mono for meta.
- **Motion**: `cubic-bezier(0.2, 0.7, 0.3, 1)` everywhere; rise-in entrances.
- **Imagery**: Real action photos only. Placeholders use cool-gray gradients with a mono label. No illustrations.

---

## Layout

| Module | Role |
|---|---|
| `tokens/` | Colors, typography, spacing, effects, fonts |
| `components/core/` | Core UI primitives (Button, PillTab, KeyChip, etc.) |
| `components/forms/` | Form primitives (TextInput, TextArea, Segmented) |
| `ui_kits/website/` | Marketing one-pager recreation |
| `ui_kits/app/` | Setup and Review screen recreations |
| `guidelines/` | Foundation specimen cards |

---

## Brand

| Asset | Use |
|---|---|
| `assets/cutline-mark.svg` | the mark, as vector — scales to anything |
| `assets/cutline-mark-256.png` | 256px raster mark |
| `assets/cutline-wordmark-onDark.png` | the mark and name in light ink — for dark grounds |
| `assets/cutline-banner.png` | 1280×640, for the repository's social preview |

All assets share their geometry with the app icon. Keep it that way — no icon font, no emoji.

