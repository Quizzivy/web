import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { expectedResolution, lockedResolution } from '../sdk-lock.mjs';

const dist = {
  integrity: 'sha512-abc==',
  tarball: 'https://npm.pkg.github.com/download/@quizzivy/sdk/1.2.3/0123abcd',
};
const lock = [
  'packages:',
  '',
  "  '@quizzivy/sdk@1.2.3':",
  `    ${expectedResolution(dist, '1.2.3')}`,
  '',
  "  '@radix-ui/number@1.1.3':",
  '    resolution: {integrity: sha512-xyz==}',
].join('\n');

test('the expected line carries the registry tarball, as pnpm writes it', () => {
  assert.equal(
    expectedResolution(dist, '1.2.3'),
    'resolution: {integrity: sha512-abc==, tarball: https://npm.pkg.github.com/download/@quizzivy/sdk/1.2.3/0123abcd}',
  );
});

test('a tarball at the URL pnpm derives is left out, as pnpm leaves it out', () => {
  const derived = { integrity: 'sha512-abc==', tarball: 'https://npm.pkg.github.com/@quizzivy/sdk/-/sdk-1.2.3.tgz' };
  assert.equal(expectedResolution(derived, '1.2.3'), 'resolution: {integrity: sha512-abc==}');
});

test('the locked line is the one under the pinned version', () => {
  assert.equal(lockedResolution(lock, '1.2.3'), expectedResolution(dist, '1.2.3'));
  assert.equal(lockedResolution(lock, '1.2.4'), null);
});

test('the lockfile has an entry for the version web/package.json pins', () => {
  const pinned = JSON.parse(readFileSync(new URL('../../../web/package.json', import.meta.url), 'utf8')).dependencies[
    '@quizzivy/sdk'
  ];
  const lockfile = readFileSync(new URL('../../../web/pnpm-lock.yaml', import.meta.url), 'utf8');
  assert.match(lockedResolution(lockfile, pinned) ?? '', /^resolution: \{integrity: sha512-/);
});
