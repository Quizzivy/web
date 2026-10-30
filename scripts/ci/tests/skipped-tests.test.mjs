import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 1 << 28 })
  .split('\0')
  .filter(Boolean);

const WEB_TESTS = /^web\/tests\/.+\.tsx?$/;

const DISABLED_WEB =
  /\b(?:(?:it|test|describe|suite|bench)\.(?:skip|skipIf|todo|fixme|fails|only)|(?:ctx|context|task)\.skip|x(?:it|test|describe)|f(?:it|describe))\s*\(/g;

const disabledInWeb = (source) => [...source.matchAll(DISABLED_WEB)].map((m) => m[0]);

const REFUSAL =
  "A failing test is fixed or put to the owner, never skipped (AGENTS.md). Quizzivy/api holds the same rule for Go tests.";

test('no web test is skipped, marked todo, focused or expected to fail', () => {
  const found = tracked
    .filter((path) => WEB_TESTS.test(path))
    .flatMap((path) => disabledInWeb(readFileSync(path, 'utf8')).map((call) => `${path}: ${call}`));
  assert.deepEqual(found, [], REFUSAL);
});

test('the scanners refuse what they are there to refuse', () => {
  for (const source of [
    "it.skip('a', () => {})",
    "describe.skipIf(ci)('a', () => {})",
    "test.fixme('a', async () => {})",
    "it.todo('a')",
    "it.only('a', () => {})",
    "xit('a', () => {})",
    "it('a', (ctx) => { ctx.skip() })",
  ]) {
    assert.equal(disabledInWeb(source).length, 1, source);
  }
  assert.equal(disabledInWeb("it('skips a blank', () => { expect(skip(1)).toBe(2) })").length, 0);
});
