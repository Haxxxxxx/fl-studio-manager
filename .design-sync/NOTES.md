# Claude Design sync: notes

- **This repo is an app, not a published design system.** The synced library is `src/ui/` (the app's own presentational components, imported by every screen). `scripts/design-lib.mjs` packages it as `fl-manager-ui` in `.design-sync/lib/` (generated, git-ignored): `.d.ts` via the repo's `tsc`, an entry that re-exports `src/ui`, and the app's compiled Tailwind CSS as `styles.css`. Always run `cfg.buildCmd` (`npm run build && node scripts/design-lib.mjs`) before the converter: the stylesheet comes from `dist/assets/index-*.css`.
- Run the converter from the repo root with `--node-modules ./node_modules` (no `--entry` flag needed: `cfg.entry` points at `.design-sync/lib/index.ts`).
- **Dark surface:** components are white-on-near-black and invisible without a dark background. `Theme` (src/ui/base.tsx) is the provider (`cfg.provider`, `padded: true`) and the documented wrapper for designs.
- **Fonts:** the app intentionally uses the OS system font stack (`-apple-system`, `Segoe UI`, …). `Inter` is only a late fallback in that stack and never shipped by the app, so validate's `[FONT_MISSING] "Inter"` is expected; designs render in the system font, like the real app. Do not add Inter as an extraFont.
- **Tailwind:** only classes the app already uses exist in `styles.css` (Tailwind v4 generates on demand). New layouts in Claude Design should reuse the vocabulary in `conventions.md`.
- `dtsPropsFor` hand-writes the props for `StatusSelect`, `CheckLine`, `AiLine`, `MixdownBadge` and `FieldRow`: their real types live in `src/types.ts` / `src/lib/launchKit.ts`, which the per-component `.d.ts` can't reference.
- **Modal preview** wraps the fixed overlay in a `transform: translateZ(0)` box so it renders inside its card (`cardMode: single`, viewport 720x460).
- Playwright for the render check: install `playwright@1.63.0` in `.ds-sync/` (pins chromium-1243, which is cached on this machine).

## Known render warns

- `[FONT_MISSING] "Inter"`: expected, see Fonts above.

## Re-sync risks

- `styles.css` is the app's compiled CSS: classes added or removed in the app change what designs can use. Re-run the build before every sync.
- `dtsPropsFor` copies the shapes of `KitField`, `AiFieldReview`, `Check` and `SongStatus`. If those types change in `src/`, update the config or the `.d.ts` the design agent sees will be wrong.
- Stage colors in `conventions.md` and `StatusDot.tsx` preview are copied from `src/lib/songs.ts` (`STATUSES`).
- The screen components (Dashboard, LaunchKitView…) are not synced: they read app stores. Only `src/ui` is.
