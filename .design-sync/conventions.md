# FL Manager UI: conventions

FL Manager is a desktop app for a rap crew's FL Studio projects: songs move through stages (Creation → Production → Prep → Release → Promotion), get mixdowns, stems and a Launch Kit for release. Dark, dense, music-first.

## Wrap everything in `Theme`

Every component is designed for the app's near-black surface (`#0f0f12`, text `#e6e6ea`, the OS system font). Without `Theme`, text is white on white and invisible.

```jsx
<Theme padded>
  <Card title="Coming out">
    <SongLines items={[{ id: "1", title: "Night Run", sub: "Ana feat. Ben", right: "2026-11-13" }]} onOpen={() => {}} />
  </Card>
</Theme>
```

## Styling idiom: Tailwind utility classes (compiled)

Components are styled with Tailwind classes. `styles.css` holds the classes the app already uses, and only those exist; reuse this vocabulary for layout glue instead of inventing classes:

| Role | Classes |
|---|---|
| Panel surface | `rounded-lg border border-white/10 bg-white/[0.03] p-4` |
| Text tiers | `text-white` (values), `text-white/75` (body), `text-white/55` (secondary), `text-white/40`, `text-white/35` (labels) |
| Small label | `text-[11px] uppercase tracking-wide text-white/40` |
| Accent (one main action) | `bg-orange-500`, selected `bg-orange-500/15 text-orange-300` |
| Status tints | `bg-emerald-500/15 text-emerald-300` ok, `bg-amber-500/15 text-amber-300` warn, `bg-red-500/15 text-red-300` missing, `bg-sky-500/15` suggested, `bg-violet-500/15` AI |
| Shape, spacing | `rounded-md`, `rounded-lg`, `rounded-full`; `gap-3`, `gap-5`, `p-4`; `divide-white/5` between rows; `hover:bg-white/5` |
| Numbers | `text-2xl` for big figures, `tabular-nums` for columns |

Class-string exports for native elements: `btn` (secondary button), `btnPrimary`, `input`, `sectionLabel`. Prefer the components `Button` (`variant="primary"` for the one main action per screen) and `Input`.

Song stage colors (use with `StatusDot`, never color alone, always with the stage name): Unsorted `#5b5b63`, Creation `#1c5cab`, Production `#2a78d6`, Prep `#5598e7`, Release `#86b6ef`, Promotion `#b7d3f6`.

## Building blocks

- Layout and numbers: `Card` (title + optional `action`), `StatTile`, `HeroStat`, `Stat`, `Meter`, `Section`, `Fact` (inside a `<dl>`).
- Controls: `Button`, `Input`, `Chip` (filter pills), `Toggle`, `StatusSelect` (stage picker), `TagEditor`, `ConfirmButton` (two-click destructive), `Modal`.
- Music: `StatusDot`, `MixdownBadge`, `SongLines` (clickable song list), `FileRow`, `Avatar`.
- Launch Kit: `FieldRow` (one release field with source badge, note, editor, checks, AI review), `KitStatus`, `CheckLine`, `AiLine`.

## Where the truth lives

Read `styles.css` (and its `@import`s) before styling, and each component's `.prompt.md` and `.d.ts` for its props. Every value a `FieldRow` shows says where it came from (Detected, Suggested, AI draft, Edited, Needs you): keep that provenance visible in any redesign.
