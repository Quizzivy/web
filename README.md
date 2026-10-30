# Quizzivy web

The React app of Quizzivy (Vite, React Router, TanStack Query), in `web/`, and
the design deck it is built to, in `docs/design/`. It talks to the API in
`Quizzivy/api` through the types of `@quizzivy/sdk`.

| Repository | What it holds |
|---|---|
| [`Quizzivy/sdk`](https://github.com/Quizzivy/sdk) | the API contract, `@quizzivy/sdk`. **A contract change starts there.** |
| [`Quizzivy/api`](https://github.com/Quizzivy/api) | the server, pinned to the same SDK |
| `Quizzivy/web` (this one) | the app, pinned to the SDK version in `web/package.json` |
| [`Quizzivy/docs`](https://github.com/Quizzivy/docs) | spec, plan, standing rules (`AGENTS.md`) |
| [`Quizzivy/infra`](https://github.com/Quizzivy/infra) | the VPS: Compose, Caddy, deploy scripts |

## Install

`@quizzivy/sdk` comes from GitHub Packages, which needs a token even to read.
Create a GitHub token with `read:packages` and add it to your user-level
`~/.npmrc`:

```ini
//npm.pkg.github.com/:_authToken=<token>
```

`//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` there works too, with the
token exported as `NODE_AUTH_TOKEN`. Not in `web/.npmrc`: pnpm does not expand
variables in a committed `.npmrc`'s credentials, so the install gets a 403.

Then:

```bash
make doctor
make install
make dev-web     # :5173, against the API on :8080: run `make dev-api` in Quizzivy/api
make help
```

Use `localhost`, never `127.0.0.1`, so the cookies behave as in production.

## The contract

The web never edits the contract. Its types, `openapi.yaml`, the shared test
data and catalogues come from `@quizzivy/sdk` at the exact version in
`web/package.json`, and the contract tests here read that copy
(`tests/support/sdk.ts`). To build against a contract change: merge it in
`Quizzivy/sdk`, then `make sdk VERSION=<the published version>`, the same
version the `Quizzivy/api` PR pins.

## More

- [`AGENTS.md`](AGENTS.md): the rules for this repository, on top of the standing rules in `Quizzivy/docs`.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): branches, pull requests, releases.
- [`docs/ci.md`](docs/ci.md): what CI runs, the live E2E against `Quizzivy/api`, the slow tail.
- [`docs/deploy.md`](docs/deploy.md): Cloudflare Pages.
