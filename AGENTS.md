# Quizzivy web: agent working rules

The standing rules live in [`Quizzivy/docs` `AGENTS.md`](https://github.com/Quizzivy/docs/blob/develop/AGENTS.md):
sources of truth, non-negotiables, code style, the design deck, i18n, tests.
They apply here unchanged. This file adds what is specific to this repository
since the split (D-082, 2026-10-30).

## The contract is pinned, not authored here

- `@quizzivy/sdk` is pinned to one exact version in `web/package.json`. Its
  `openapi.yaml`, `testdata/` and `catalogs/` are what the contract tests read,
  through `tests/support/sdk.ts`; never a sibling checkout.
- Adding or changing an endpoint starts with a PR in `Quizzivy/sdk`. The pin
  here moves to the version that PR published, the same one `Quizzivy/api`
  pins, with `make sdk VERSION=…`.
- Data both sides agree on (the audit action sentences, the join-code format,
  the pasted-text counts, the content fixtures) is in that package. The tests
  here compare the app with it: a label or a rule that disagrees fails here.
- The structural contract checks run in `Quizzivy/sdk`. What stays here
  compares the contract with this app's code: navigation, API groups, MSW
  fixtures, media limits, content guards, labels.

## CI

`docs/ci.md` describes it. Plan (`scripts/ci/plan.mjs`) skips a job whose files
already passed. E2E (live API) starts `Quizzivy/api` at the commit in `api-ref`;
bump that file (a full commit id) when the web needs a newer API.

## Deploys

Merging to `main` deploys to Cloudflare Pages (`.github/workflows/deploy.yml`)
once the repository variable `WEB_DEPLOY` is `pages`; until production switches
over from `SekiroKenjii/Quizzivy` it is unset and nothing deploys from here. The
API deploys first: the web job refuses to deploy a build that pins a newer SDK
than production serves. Deploys, secrets, tags and merges to `main` are the
owner's.
