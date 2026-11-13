import { preview } from "vite";

/**
 * Serves the one production build on three ports of localhost, which the E2E
 * suites read as three hosts (playwright.config.ts): 4173 is one host for
 * every page, 4174 the student host and 4175 the staff host. Ports, and not
 * names such as my.localhost: two ports of localhost are two origins of one
 * site, as my.* and portal.* are to api.* in production, so the API's
 * SameSite=Lax refresh cookie reaches it from each; `x.localhost` is another
 * site than `localhost`, and the cookie would never be sent.
 */
for (const port of [4173, 4174, 4175]) {
  await preview({ preview: { port, strictPort: true, host: "localhost" } });
}
