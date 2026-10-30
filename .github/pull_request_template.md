<!--
One task from docs/plan/*.md = one branch = one PR.
Title: `T-<phase>.<n>: <imperative title>` (Phase R: `T-R<k>.<n>`)
-->

## Task

Closes **T-_._** — <title>

## What changed

<!-- Two or three sentences. What a reviewer needs before reading the diff. -->

## Definition of done (spec §14)

- [ ] TypeScript strict passes; no `any` without a comment
- [ ] Lint clean
- [ ] Loading / error / empty states present
- [ ] Keyboard-operable; visible focus
- [ ] All strings via `t()`, keys in both `vi` and `en` — new keys listed below
      for review (vi written first; en from the deck)
- [ ] Tests added or updated at the right level (spec §14)
- [ ] Screens compared with `docs/design/deck/` at 360, 768, 1024, 1280 and
      1440, light and dark (table below)
- [ ] The task's own "Done when" boxes are all ticked

<!--
Deck comparison, one row per screen changed:
| Screen | Deck page | Widths checked | Light | Dark | Differences |
-->

## The contract

<!-- Delete if web/package.json's @quizzivy/sdk pin did not change. -->

- [ ] The contract change merged in Quizzivy/sdk: <sdk PR link>
- [ ] `@quizzivy/sdk` pins the version that PR published (`make sdk VERSION=…`),
      the same version as the Quizzivy/api PR: <api PR link>

## New dependencies

<!--
Required by spec §14 and §18: no new dependency without a stated reason.
Write "None" if there are none. Otherwise one line each: package — why, and
what was considered instead.
-->

None
