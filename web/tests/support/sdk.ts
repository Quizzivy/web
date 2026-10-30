import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * The path of a file shipped in the pinned `@quizzivy/sdk` (package.json), such
 * as "openapi.yaml", "testdata/content-v1.json" or "catalogs/join-code.json".
 * The contract, its fixtures and the shared catalogues live in Quizzivy/sdk
 * (D-082); the web tests read the copy this build pins, never a sibling
 * checkout.
 */
export function sdkFile(path: string): string {
  return require.resolve(`@quizzivy/sdk/${path}`);
}
