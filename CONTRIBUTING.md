# Contributing

Read [`AGENTS.md`](AGENTS.md) first, then the standing rules in
[`Quizzivy/docs`](https://github.com/Quizzivy/docs/blob/develop/AGENTS.md).

## Branch model

Gitflow, as before the split.

| Branch | Purpose |
|---|---|
| `main` | Released only, tagged `vX.Y.Z`. Merging to `main` deploys the web once `WEB_DEPLOY` is set (until then, nothing). |
| `develop` | Integration. Every feature PR targets this. |
| `feature/<task>-<slug>` | One task. Branch off `develop`. |
| `release/<version>` | Release PR into `main`, then back-merged into `develop`. |
| `hotfix/<slug>` | Off `main`, merged to both. |

Merge with a merge commit, never a squash. The required check is **CI result**.

## A change that touches the API

1. The contract PR in [`Quizzivy/sdk`](https://github.com/Quizzivy/sdk), and the
   [`Quizzivy/api`](https://github.com/Quizzivy/api) PR that implements it.
2. After the sdk merge, `make sdk VERSION=<the published -dev version>`, the
   version the api PR pins. If the web's live E2E needs the new API, set
   `api-ref` to the api commit that has it.
3. Open this PR.

## A release

The API releases first. The release PR here pins the release `X.Y.Z` of
`@quizzivy/sdk` (CI refuses a `-dev` pin on a PR into `main`), and the deploy
refuses to ship a pin newer than the SDK production serves (`latest`, which the
API's deploy moves).

## Before opening a PR

- `make check` (lint, typecheck, format, tests).
- Changed screens compared with the deck, as the PR template asks.
