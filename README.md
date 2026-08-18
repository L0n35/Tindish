# Tindish

**Stop deciding. Start eating.**

A mobile-first web app for one very specific problem: choosing dinner when choosing is the
hard part. A session reads the mood fast — an adaptive swipe round, a knockout bracket of
only the dishes she explicitly wanted, and a match screen with her champion. **The dealer
deals; it never decides.** Only dishes she liked, superliked, or probe-picked can become
finalists; the match line narrates the result and never picks it. No code path forces a verdict.

Personal project. Two users, no accounts, no database, no recipes.

## Quick start

```bash
npm ci
npm run dev
```

That's it — **the app needs no env vars at all**. The match-screen line comes from local
template copy, rendered instantly and deterministically from session state.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build` | production build (Nitro output in `.output/`) |
| `npm run typecheck` | `nuxt typecheck` (vue-tsc) |
| `npm test` | Vitest unit suite + simulation invariants (~200 tests, ~4,000 simulated sessions) |
| `npm run test:e2e` | builds, then Playwright at 375×667: smoke flows, real-drag CLS test, axe |
| `npm run sim` | prints the adaptive-vs-shuffled efficiency report (never asserted in CI) |

All four quality gates (`typecheck`, `test`, `test:e2e`, `build`) are part of done.

## Deploy (Vercel, zero-config)

Push the repo → import in Vercel. Nitro auto-detects the Vercel preset; there are no env
vars and nothing else to configure.

## Tuning guide

Every tunable lives in **`shared/tuning.ts`**, and every value there is commented — that
file is the intentional exception to the minimal-comments rule. Reaction weights, the
smoothing constant K, the deal schedule block, card/probe/OMG caps, the streak threshold,
soft penalties, the restore window, the dealer mode. **Bump `tuningVersion` on any change**
— it's stamped into saved sessions, and a mismatched in-flight session is safely discarded
on next load (finished history records are unaffected).

Swipe-physics constants (commit thresholds, fling velocity, animation timings) live in the
same file under `swipe`.

## Deck curation

The starter deck (`shared/data/deck.ts`, 96 dishes) is deliberately generic. **Prune it to
dishes you'd actually cook or can actually order locally; feasibility beats variety.** The
balance tests will fail loudly if edits skew the pool — per mode: no cuisine or format over
20%, every vibe between 15–40%, no vibe temperature-confounded.
Run `npm test` after every edit; the failure messages name the violated
constraint. Engine or reducer semantic changes should bump `ENGINE_VERSION`
(`shared/engine/version.ts`) so old saved sessions are discarded rather than mis-replayed.

## Field-test protocol

Use the app for **10 real dinner decisions before adding features.**

- **Dealer mode auto-alternates by seed parity** (even seed → adaptive, odd → shuffled;
  `DEALER_MODE: 'auto'`) — no editing `tuning.ts` between dinners, the A/B runs itself.
- **`/debug`** (type the URL; it's deliberately unlinked) shows one row per session: dealer
  mode, cards dealt, positives, OMGs, probes, extension, time-to-champion, how it ended —
  and the **eaten** toggle. Tap it after you actually cooked/ordered the champion; it's the
  only way the data can know feasibility.
- Watch for: **abandoned sessions** (friction), **runner-up swaps** (verdict quality),
  **probe frequency** (deck fit), **uneaten champions** (feasibility).
- Be honest about scale: ten dinners finds glaring problems and directional signal, not
  statistical proof — more sessions, more signal. `npm run sim` gives the simulated
  counterpart, and it prints rather than asserts for a reason.
- **Tune `tuning.ts` before writing new features.**

Two checks that stay manual (automation can't reach them): verify the swipe gesture on the
real iOS and Android phones it will live on (two-finger zoom must still work over the
cards), and install to the home screen from the share sheet.

## Images

Ships with zero photos and looks designed anyway (deterministic gradient + emoji cards).
Photo presence is governed **solely** by `public/images/manifest.json` — only listed ids
ever produce an image request, so nothing 404s, ever. Every deck dish currently ships
with a real, openly-licensed photo (attribution in `public/images/credits.json`),
sourced via `python scripts/source_images.py` — see
**[docs/image-sourcing.md](docs/image-sourcing.md)** for the automated workflow, the
manual stock-photo upgrade path, and licensing notes. Processed card art comes from
`python scripts/standardise_images.py`. No AI-generated imagery, anywhere.

## Testing

- **Unit (Vitest)** — deck balance/confound, scoring math, opening trio vs brute force,
  the deal schedule, probe semantics (including the 3-OMGs-then-7-dislikes edge), stop
  rules and the extension table, bracket shapes and seeding, undo integrity, the reducer
  legality matrix, **replay determinism** (every session log re-folds to the identical
  state), **preview purity/exactness**, persistence resets and legacy-key strip-migrations,
  and the match-line template copy.
- **Simulation** — 8 hidden-preference agents (from `hearty` to `refusenik`) drive the real
  reducer through ~4,000 seeded sessions per run. Assertions are correctness invariants
  only: every finalist explicitly positive, every session terminates legitimately, caps
  respected, replay equality. Efficiency is a printed report (`npm run sim`), never a CI
  assertion.
- **E2E (Playwright, 375×667)** — happy path with a zero-404 network sweep and touch-target
  checks; probe → fallback in both history variants; a **real pointer drag** measuring
  gesture-time layout shift via `PerformanceObserver` (< 0.01); the OMG-cap bounce; a
  mid-bracket reload restore; and `@axe-core/playwright` WCAG A/AA passes over home,
  swipe, bracket, and match.

## How it decides nothing

For the curious: sessions are event-sourced. Every gesture appends to a log; the entire
session state — including what the dealer dealt — re-derives from `(seed, deck, tuning,
events)` through one pure fold, which is how a mid-bracket phone reload restores exactly
and how the simulator and tests share the app's real code path. Randomness is counter-based
(`deriveRng(seed, decisionIndex)`), so preloading the three possible next cards is both
side-effect-free and exactly predictive. The v2 group-mode sketch (§14 of the spec) reuses
this shape: same deck, same card UI, same match screen, votes as events.
