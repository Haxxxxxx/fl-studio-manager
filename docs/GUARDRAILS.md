# Hivo: project guardrails (read before any work)

These are HARD RULES, not guidance. If a request conflicts with one of these, DO NOT silently comply.
STOP and say: "This conflicts with guardrail <N>. Confirm you want to override it before I continue."
Do not optimize, extrapolate, or "improve" past what was literally asked.

================================================================
## RULE 0 - ANTI-DRIFT (the meta-rule)
This project has a documented pattern: one user asks for a SMALL thing, and it gets extrapolated into a HUGE thing.
Real examples that already happened and were caught:
- "editable columns" -> mis-scoped as "rebuild all of Notion"
- "a list view" -> mis-scoped as "every view type possible"
- "show my stats" -> a scraping project for data that has no free API
When you receive a request, restate the LITERAL minimum first. Build that. Do NOT add adjacent features, extra views, extra automation, or "while we're here" work. If you think something more is needed, ASK; don't build it.

================================================================
## RULE 1 - WHAT HIVO IS (do not drift from this identity)
Hivo is a **release-and-promotion tool for a music crew that already makes the music but is weak at getting it heard.**
It is NOT, and must not drift into:
- a monitoring dashboard ("see what your friends are doing") - this LOSES to a group chat; never build passive visibility
- a group chat / social feed
- a full "label-in-a-box"
- a general project-management/Notion clone
If a feature only adds passive visibility, STOP (guardrail 1) - it's the exact dead end already rejected.

================================================================
## RULE 2 - CONNECTIVE TISSUE, NOT THE WHOLE FACTORY
Hivo connects the tools a release flows through; it does NOT replace them.
- Hivo DOES: the pipeline (Creation -> Production -> Prep -> Release -> Promotion) + promotion prep via the Launch Kit + crew coordination/shared memory.
- Hivo HANDS OFF to a human: posting, outreach, relationships, A&R judgment. Never try to automate these.
- Lives ELSEWHERE, do not rebuild: the DAW (makes music), the distributor (puts it on platforms), socials (host posts).
Before building anything, ask: is this Hivo's job, a human's job, or another tool's job? If it's not Hivo's job, STOP.

================================================================
## RULE 3 - THE CREW SIDE MUST BE COORDINATION, NEVER MONITORING
The crew side is justified ONLY by doing what a group chat cannot:
- surface dropped balls (e.g. a track stalled 3+ weeks)
- be shared memory (agreed release order, who's doing what)
- fire work (trigger Launch Kit, assign reel/cover when release-ready)
If a proposed crew feature is just "display what everyone is doing," STOP (guardrail 3).

================================================================
## RULE 4 - SEQUENCING (hard order, do not jump ahead)
1. The crew sign-in / invite / sharing flow is **UNTESTED BY A HUMAN.** Nothing new may be built ON TOP of it until it is verified end to end. If asked to build on the crew foundation, first warn that it's unverified.
2. Coordination tool = the November milestone. Prove people will live in the board FIRST.
3. The label/money layer (splits, costs, revenue, release slate) comes ONLY AFTER the crew actually releases through Hivo. Building it now = a cockpit for a plane nobody has boarded. If asked to build money/splits now, STOP (guardrail 4).

================================================================
## RULE 5 - THE LAUNCH KIT IS PROTECTED
The Launch Kit is the deal-breaker feature and Hivo's promotion engine. It is solo-valuable.
- NEVER hide it entirely. NEVER gate it behind having a crew. It stays available to everyone, solo or crew (may be less prominent for solo, not removed).
- Do not propose removing it based on one user not using it in week one.

================================================================
## RULE 6 - EXPLICITLY REJECTED / BLOCKED (do not build; do not re-investigate)
- **Release-stats dashboard** (streams/listeners/revenue from DistroKid/Spotify/Deezer/SoundCloud): BLOCKED. No free API gives real numbers. DistroKid: no API. Spotify: only a 0-100 popularity score, real stats closed, terms forbid feeding to AI. Deezer: no per-track plays. SoundCloud: real plays but API closed to new keys. Crew wants real numbers or nothing, so a public snapshot is worse than nothing. DO NOT BUILD. Do not re-research unless the user explicitly says the block changed.
- **"All of Notion" / every view type:** rejected. The pipeline has EXACTLY three views - board, list, table - over ONE shared model.
- **Automating human reach** (posting, outreach, relationships): rejected, these are hand-offs.

================================================================
## RULE 7 - COST HONESTY / STOP-AND-FLAG TRIGGERS
If any task starts to require work beyond its stated justification, STOP and flag it. Specific tripwires:
- The table view was approved ONLY because it rides on the list view's shared logic for near-free. If it starts needing its own data plumbing (inline editing infra, resizing backend, its own sorting/filtering), STOP.
- A custom pipeline column must not corrupt the fixed lifecycle-stage model that crew members rely on. If custom columns conflict with fixed stages, STOP.
- Anything requiring a PAID service or a new dependency: STOP and ask (free stack only).

================================================================
## RULE 8 - SHARED vs PER-VIEW (pipeline views) - do not get this wrong
- SHARED across board/list/table (lives on the data model): column identity, column NAME, add/remove/reorder columns, a song's stage, and all data edits. Rename a column once -> all three views show the new name.
- PER-VIEW (transient only): table sort order, collapsed/visible columns, column widths. Sorting the table must NEVER reshuffle the board.

================================================================
## EXCEPTION - THE DIGGER (approved by the user, 2026-10-16)
The Digger (left menu) is a deliberate, user-approved exception to rules 1-2: it serves the Creation stage (finding beats to write on), not release or promotion.
- Scope is fixed: raw beats from Settings -> Beats folders, pick up to 5, the AI describes what they share and finds similar beats on the web (YouTube Data API if a key is set, Gemini search grounding, plain YouTube search links).
- Beats live ONLY in the Digger: never in Library, stats, calendar or the crew backend.
- NO downloading from YouTube or anywhere (terms of service). Leasing or buying a beat is a human hand-off: the Digger only opens links.
- The official YouTube embedded player inside the app (nocookie host, play only) was approved by the user on 2026-10-24; downloading stays forbidden.
- Audio sent to the AI is opt-in (a Settings toggle), short excerpts only, disclosed in the UI.
- Anything beyond this (a beat store, auto-download, producer outreach, beat stats): STOP and flag, rule 0 applies.
