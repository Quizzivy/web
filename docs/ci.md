# CI

`.github/workflows/ci.yml` runs on every pull request and on every push to
`main`, `develop` and `work/**`. One check, **CI result**, is what the branch
rules require; it passes only when every job did what the plan asked of it.
The rules come from the monorepo's CI (`Quizzivy/api` keeps the server's half,
in its `docs/setup/ci.md`).

## What runs

| Job | Reads | Does |
|---|---|---|
| Plan | everything | Tests `scripts/ci/`, then decides which jobs run |
| Deck | `deck` | `scripts/check-design-deck.mjs` |
| Web checks | `web` | On a PR into `main`, that `@quizzivy/sdk` is pinned to a release; `pnpm lint:ci`, typecheck, `pnpm format:ci`, integration tests, build |
| Web unit | `web` | The unit suite, in three shards |
| E2E | `web` | Playwright against a production build, API stubbed |
| E2E (live API) | `code` | Playwright against `Quizzivy/api` at `api-ref`: its API and Word import worker, Postgres, MinIO |
| CI result | — | Fails unless each job above did what the plan said |
| Sonar | everything | Pushes to `develop` only; not part of the result |

Every job that installs the web reads `@quizzivy/sdk` from GitHub Packages with
the workflow token (`packages: read`). The package must grant this repository
read access (its Package settings, "Manage Actions access").

## How a job is skipped

As in the monorepo: `scripts/ci/plan.mjs` names the sets of files each job
reads, hashes them, and skips a job when the newest marker for that hash is a
pass (`ci-pass-<job>-<hash>`, kept 30 days). A push to `main` and "Re-run all
jobs" ignore earlier proof. Each job checks out only its set, so a test that
reads a file outside it fails instead of being skipped.

- `web`: everything but the docs, the deck and `api-ref`.
- `code`: everything but the docs; E2E (live API) reads it, so a bump of
  `api-ref` runs the live suite and nothing else.
- `deck`: `docs/design/` and its checker.

## E2E (live API)

The job reads `api-ref`, a full commit id of `Quizzivy/api` (a branch name
would move under an unchanged hash, and `plan.test.mjs` refuses one), and
checks that commit out into `api-checkout/`. From there it builds the API and
the Word import worker, provisions the roles, migrates and seeds, starts MinIO
from the api's compose file and builds the Word converter image, then runs
`pnpm e2e:live` on one worker. The MinIO image is pulled from
`ghcr.io/quizzivy/quizzivy-minio` when this repository may read that package,
and built from source otherwise (a few minutes slower).

Bump `api-ref` when the web needs a newer API, in the same PR as the change
that needs it. Locally: run the API from a `Quizzivy/api` checkout (`make up`,
`make migrate seed`, `make dev`), set `EMAIL_SINK_DIR` to the same directory
for both, and run `make e2e-live` here.

## The slow tail

`.github/workflows/slow-tail.yml` runs the specs of the `slow` Playwright
project, which holds one spec today: E2E 5, `timer-expiry.live.spec.ts`, which
waits out a real one-minute deadline. It runs every night at 19:00 UTC against
`develop`, on every pull request into `main` (read its check, **E2E (waits on
real time)**, before merging a release), and by hand. It is not part of **CI
result**. GitHub starts a schedule only from the default branch's copy of the
file. The server's half of E2E 5, the attempt deadline, is tested in
`Quizzivy/api`.

## A skipped test fails Plan

`scripts/ci/tests/skipped-tests.test.mjs` fails on a web test that is skipped,
todo, fixme, expected to fail or focused. Playwright retries twice in CI, so a
flaky test passes: search the job log for `flaky` and treat each as a finding.

## Images and actions

The `postgres:18` service is pulled from `mirror.gcr.io`, which has no Docker
Hub pull limit. Actions from outside `actions/` are pinned to a full commit SHA
with the tag in a comment.

## Branch rules

The owner sets them under Settings › Rules, as in `Quizzivy/api`: `pull
requests only` (`main`, `develop`, `work/**`), `no deletion` (`main`,
`develop`) and `ci result` (**CI result** required on `main`, `develop`,
`work/**`).
