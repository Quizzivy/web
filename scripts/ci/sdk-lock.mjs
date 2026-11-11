import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// GitHub Packages serves a tarball from its own download URL, which pnpm
// cannot derive from the package name, so the lockfile has to carry it. An
// entry written without a registry token (a Claude session, say) gets it
// wrong, and the frozen install then fails on a bare 404. This check names
// the line the lockfile needs instead.

const SDK = '@quizzivy/sdk';

/** lockedResolution returns the lockfile's resolution line for the SDK at version. */
export function lockedResolution(lock, version) {
  const lines = lock.split('\n');
  const at = lines.indexOf(`  '${SDK}@${version}':`);
  return at === -1 ? null : (lines[at + 1] ?? '').trim();
}

/**
 * expectedResolution is the resolution line pnpm writes for what the registry
 * serves: the tarball only when it is not at the URL pnpm would derive.
 */
export function expectedResolution(dist, version) {
  const derived = `https://npm.pkg.github.com/${SDK}/-/sdk-${version}.tgz`;
  if (dist.tarball === derived) return `resolution: {integrity: ${dist.integrity}}`;
  return `resolution: {integrity: ${dist.integrity}, tarball: ${dist.tarball}}`;
}

function main() {
  const web = fileURLToPath(new URL('../../web/', import.meta.url));
  const version = JSON.parse(readFileSync(`${web}package.json`, 'utf8')).dependencies[SDK];
  const locked = lockedResolution(readFileSync(`${web}pnpm-lock.yaml`, 'utf8'), version);
  let dist;
  try {
    dist = JSON.parse(execFileSync('npm', ['view', `${SDK}@${version}`, 'dist', '--json'], { cwd: web, encoding: 'utf8' }));
  } catch {
    console.log(`::error::could not read ${SDK}@${version} from GitHub Packages: does this repository have read access to the package?`);
    process.exitCode = 1;
    return;
  }
  const expected = expectedResolution(dist, version);
  if (locked === expected) return;
  console.log(`::error::web/pnpm-lock.yaml has the wrong resolution for ${SDK}@${version}`);
  console.log(`  has:  ${locked ?? '(no entry)'}`);
  console.log(`  want: ${expected}`);
  console.log('Run `make sdk VERSION=...` with a registry token, or put the line above under the package entry.');
  process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
