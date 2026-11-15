# Deploying the web

Merging `release/*` into `main` ships the web to Cloudflare Pages: one project,
`quizzivy-web`, with two custom domains, `my.quizzivy.com` for students and
`portal.quizzivy.com` for teachers and admins. Nothing deploys from `develop`.
`.github/workflows/deploy.yml` runs on `workflow_run` after **CI** concludes on
`main`, only for the CI run of a push, and only while its commit is still the
tip of `main`.

**Since the repository split:** production has deployed from this repository
since 2026-11-12 (v0.13.4), when the owner set the repository variable
`WEB_DEPLOY` to `pages`. Without that variable the workflow deploys nothing,
which is the way to hold deploys back. The API's deploy, its rollout notes and
the operations docs are in `Quizzivy/api` (`docs/setup/`).

## The API goes first

The API deploys from `Quizzivy/api`, and its deploy makes the SDK it serves the
`latest` dist-tag of `@quizzivy/sdk` (D-081). The web job reads the SDK version
`web/package.json` pins and refuses to deploy when it is newer than `latest`:
that build would call operations production does not have yet. Deploy the API,
wait for its promote, then re-run this workflow.

## What has to be set once

The job fails with a named error before touching production if any is missing.

```bash
gh secret set CLOUDFLARE_API_TOKEN      # "Cloudflare Pages: Edit" on the account
gh secret set CLOUDFLARE_ACCOUNT_ID
gh variable set VITE_GOOGLE_CLIENT_ID --body '<client-id>.apps.googleusercontent.com'
gh variable set VITE_ORG_NAME --body '…'
gh variable set VITE_ORG_FRONT_DESK_PHONE --body '…'
gh variable set VITE_ORG_FRONT_DESK_HOURS --body '…'
gh variable set VITE_ORG_EMAIL --body '…'           # the landing site's lines:
gh variable set VITE_ORG_ADDRESS --body '…'         # unset, a line is hidden
gh variable set VITE_ORG_ADDRESS_EN --body '…'
gh variable set LANDING_PAGES_PROJECT --body '…'    # unset, the landing site is not deployed
gh variable set WEB_DEPLOY --body pages  # set since 2026-11-12; without it nothing deploys
```

`VITE_GOOGLE_CLIENT_ID` is a variable, not a secret: it travels in the
authorization URL. A build without it does not fail, it hides the Google
button, so the job checks for it.

## One build, two hosts

Both domains serve the same files. The bundle reads the origin it is opened at
against two build inputs, `VITE_STUDENT_APP_URL` and `VITE_STAFF_APP_URL`
(`src/app/host.ts`), which `deploy.yml` sets from `STUDENT_ORIGIN` and
`STAFF_ORIGIN` at its top:

| Opened at | Serves |
|---|---|
| the student host | the student's pages at the root (`/`, `/classes`, `/assignments/:id`, `/settings`, `/attempts/:id`) and `/join` |
| the staff host | `/teacher/...` and `/admin/...`; `/` goes to the user's console |
| any other origin | every page: a preview URL, `localhost` |

Each host has the sign-in pages, and a path of the other host is a 404 there.
A teacher's join link and QR always name the student host. The API keeps a
session per host and admits an account only at the host it belongs at
(`Quizzivy/api`, `STUDENT_APP_URL` and `STAFF_APP_URL`), so the two origins
here and there have to be the same two.

## The landing site

`quizzivy.com` is not a host of the app. It is a build output of its own,
`web/dist-landing` (`pnpm build:landing`, `vite.landing.config.ts`), deployed
to a Pages project of its own (the owner, 2026-11-15: "Project riêng"). Built
into the app's bundle, opening the Landing took 326 KiB of JavaScript, gzip,
against the 200 KB the plan allows; on its own it takes 146 KiB, and
`tests/integration/landing-bundle.test.ts` holds it under the cap.

- **What it serves.** The Landing at `/`, the privacy notice at `/privacy`,
  the status page at `/status`, and a not-found page for anything else. The
  build writes `landing.html` as `index.html` and carries the app's
  `_redirects`, so a direct visit or a reload of any path opens that page.
  `/version.json` names the build and the version, as the app's does.
- **What it shares with the app.** The sources (`src/features/landing`, with
  the app's tokens, a few primitives and its public files), and nothing of the
  app's entry: no session, no API client, none of the app's strings. Its own
  strings are `src/features/landing/locales/`.
- **What it asks the API.** Nothing when it opens. Its two calls are the
  consultation form (`POST /public/leads`) and the status page
  (`GET /public/status`), both without credentials. The API answers them from
  the site's origin when its `LANDING_URL` names it, and nothing else from it.
- **Where its links lead.** Every link into the app is written with its host,
  from the same two build inputs as the app: "Đăng nhập" offers the student
  host and the staff host, and a class code opens `<student host>/join/<code>`.
- **The centre's lines** come from the build, never from the API:
  `VITE_ORG_NAME`, `VITE_ORG_FRONT_DESK_PHONE`, `VITE_ORG_EMAIL`, and
  `VITE_ORG_ADDRESS` with its English form `VITE_ORG_ADDRESS_EN`. A line that
  is unset is hidden.
- **The centre's name** is `VITE_ORG_NAME` and nothing else (the owner,
  2026-11-15: "Ms Giau English Centre"). No string of the site and no tag of
  `landing.html` spells a name: the lines that name the centre say `{{org}}`
  (the sentence under the headline, the label above the consultation, the
  consent a visitor ticks, the footer, the notice's first part), and the
  page's two description tags say `%VITE_ORG_NAME%`, which the build fills.
  A build that sets no name prints the product's, "Quizzivy", in every one of
  those places; that is for a local build only, and a deploy of the site
  refuses to go out without the variable.
- **Its one address.** `LANDING_ORIGIN` at the top of `deploy.yml`
  (`https://quizzivy.com`) reaches the build as `VITE_LANDING_URL`. The
  Landing and the notice name themselves by it (`<link rel="canonical">`, set
  by the page, and `og:url`), and the build writes `robots.txt` and
  `sitemap.xml` naming it. The Pages project also answers on its `pages.dev`
  host and on a host per deployment, with the same pages: `landing.headers`,
  which the build appends to the app's `_headers`, sends
  `X-Robots-Tag: noindex` on both.
- **Deploying it.** The same `Web → Cloudflare Pages` job builds both outputs
  from one commit and checks both before it deploys either: the app first,
  then the landing site, to the project the repository variable
  `LANDING_PAGES_PROJECT` names, with the same account and token. While that
  variable is unset the site is not built or deployed, and the run says so.

Adding or renaming a host is three changes that go together: the two origins in
`deploy.yml`, the custom domain on the Pages project, and the API's settings
(its two host URLs, `CORS_ALLOWED_ORIGINS` and `GOOGLE_REDIRECT_URI`) with the
redirect URI registered in the Google Cloud Console.

## The build-time trap

`VITE_*` values are inlined at build time; there is no runtime override.
`src/lib/api/client.ts` falls back to `http://localhost:8080` when
`VITE_API_BASE_URL` is unset, so the job greps the bundle for
`https://api.quizzivy.com` and fails without it, greps it for the two hosts'
origins for the same reason, and checks that `public/_headers` reached `dist/`.
Do not remove any of the three.

## Running it by hand

Actions → **Deploy** → *Run workflow*, to retry a deploy that failed for an
infrastructure reason without re-running the tests. `workflow_run` reads the
workflow from the default branch, so the first release may need this.

## Cutting a release

The API releases first (`Quizzivy/api`, `CONTRIBUTING.md`). Then:

```bash
git checkout -b release/0.14.0 develop
make sdk VERSION=0.14.0        # the release the owner tagged in Quizzivy/sdk
# set "version" in web/package.json to the release
git push -u origin release/0.14.0 && gh pr create --base main
git fetch origin && git tag v0.14.0 origin/main && git push origin v0.14.0
gh pr create --base develop --head main   # back-merge; its CI run does not deploy
```

CI refuses a `-dev` SDK pin on a PR into `main`. Read the slow tail's check
(**E2E (waits on real time)**) on the release PR before merging.

## Verifying afterwards

```bash
curl -o /dev/null -w '%{http_code}\n' https://my.quizzivy.com/join/K7M3-P9QR   # 200, the SPA shell
curl -o /dev/null -w '%{http_code}\n' https://portal.quizzivy.com/teacher      # 200, the same shell
curl -s https://my.quizzivy.com/version.json; curl -s https://portal.quizzivy.com/version.json   # one build
```

`web/public/_redirects` is what makes a QR-code link work on a cold load; it
fails silently at the CDN if it is dropped from the build output.
