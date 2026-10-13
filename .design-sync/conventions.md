# FL Manager UI: conventions

FL Manager is a desktop app for a rap crew's music projects: songs move through stages (Creation → Production → Prep → Release → Promotion), get mixdowns, stems and a Launch Kit for release. The look is **System 02, "built like a rack unit"**: hardware panels, engraved labels and LED status for structure; loud condensed type and one orange for attitude. Dark, dense, music-first.

## Wrap everything in `Theme`

Every component is designed for the app's chassis (`#0D0D0C`, body text `#C9C5BB`, IBM Plex Sans 14px). Without `Theme`, text is light on white and invisible.

```jsx
<Theme padded>
  <Card title="Coming out">
    <SongLines items={[{ id: "1", title: "Night Run", sub: "Ana feat. Ben", right: "2026-11-13" }]} onOpen={() => {}} />
  </Card>
</Theme>
```

## Principles

1. **Engraved, not tinted.** Labels are small mono caps (`engrave`). No pastel `/15` pills: status is a lit LED (`StatusDot`) next to a word.
2. **One loud voice.** Orange (`hot`) only for the main action, "needs you" and active LEDs. Selection is cream on black, never orange.
3. **Solid surfaces.** Warm greys, not white-alpha layers. 4px corners, hard 1px rules, heavy 3px section rules.
4. **Provenance by shape.** Detected, Suggested, AI draft, Edited, Needs you differ by fill and border style, not just hue (`SourceBadge`). AI has no special colour.

## Styling idiom: Tailwind utility classes with theme tokens

Components are styled with Tailwind classes. `styles.css` holds the classes the app already uses, and only those exist; reuse this vocabulary for layout glue instead of inventing classes:

| Role | Classes |
|---|---|
| Surfaces | `bg-chassis` (#0D0D0C app), `bg-panel` (#161614 cards), `bg-raised` (#1F1F1C hover, modal) |
| Panel | `rounded border border-rule bg-panel p-5 shadow-panel` |
| Rules | `border-rule` (#2C2B27), `border-rule-strong` (#3D3C37), `divide-rule` |
| Ink | `text-cream` (#F2EFE8 values, selected), `text-body` (#C9C5BB prose), `text-engrave` (#8D897F labels) |
| Engraved label | `engrave` export = `font-mono text-[10.5px] uppercase tracking-[0.14em] text-engrave` |
| Signal | `bg-hot`/`text-hot` (#FF5A1F), `ok` (#3DDC84), `warn` (#FFC233), `missing` (#FF4040) |
| Type | `font-display` (Barlow Condensed: titles in caps, buttons, big figures), `font-sans` (IBM Plex Sans), `font-mono` (IBM Plex Mono: labels, data, BPM, dates) |
| Selected | `bg-cream text-chassis` |
| Numbers | `font-display text-4xl font-semibold tabular-nums text-cream` for figures, `font-mono tabular-nums` in columns |

Class-string exports for native elements: `btn` (secondary), `btnPrimary`, `btnQuiet` (Cancel), `input` (recessed field), `engrave`, `sectionLabel`. Prefer the components `Button` (`variant="primary"` for the one main action per screen, `"quiet"` for Cancel) and `Input`.

Song stage colors are one blue ramp, dark → light (use with `StatusDot`, never color alone, always with the stage name): Unsorted `#5B5B63`, Creation `#1C5CAB`, Production `#2A78D6`, Prep `#5598E7`, Release `#86B6EF`, Promotion `#B7D3F6`. Blue means "stage" only: charts stay neutral (cream → grey).

## Building blocks

- Brand: `LogoMark` (the FL rack key, orange with one LED).
- Layout and numbers: `Card` (engraved title + optional `action`), `StatTile`, `HeroStat`, `Stat`, `Meter` (segmented LED bar), `Section`, `Fact` (inside a `<dl>`).
- Controls: `Button`, `Input`, `Chip` (filter, cream when selected), `Toggle` (LED switch), `StatusSelect` (stage picker), `TagEditor`, `ConfirmButton` (two-click destructive, arms red), `Modal`.
- Music: `StatusDot` (LED), `MixdownBadge` (LED + Mix current / Mix outdated / No mixdown), `SongLines`, `FileRow`, `Avatar` (initials key).
- Launch Kit: `FieldRow` (one release field with source badge, note, editor, checks, AI review), `SourceBadge`, `KitStatus`, `CheckLine`, `AiLine` (dashed panel).

## Where the truth lives

Read `styles.css` (and its `@import`s) before styling, and each component's `.prompt.md` and `.d.ts` for its props. Every value a `FieldRow` shows says where it came from (Detected, Suggested, AI draft, Edited, Needs you): keep that provenance visible in any redesign.
