import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseReview, review } from '../src/claude.js';
import { classify, getStagedDiff } from '../src/git.js';
import { render } from '../src/render.js';

const GOOD = JSON.stringify({
  findings: [
    { severity: 'high', file: 'a.js', line: 3, issue: 'SQL built by string concat', suggestion: 'use params' },
    { severity: 'bogus', file: 'a.js', line: 'x', issue: 'off-by-one in loop' },
  ],
  commit_message: 'fix(db): parameterize query',
});

test('parseReview extracts JSON from fenced/prose output and normalizes fields', () => {
  const r = parseReview('Here you go:\n```json\n' + GOOD + '\n```');
  assert.equal(r.findings.length, 2);
  assert.equal(r.findings[1].severity, 'low');
  assert.equal(r.findings[1].line, null);
  assert.equal(r.commit_message, 'fix(db): parameterize query');
});

test('parseReview rejects malformed shapes', () => {
  assert.throws(() => parseReview('no json'));
  assert.throws(() => parseReview('{"findings": []}'));
});

test('review retries once on malformed output, then succeeds', async () => {
  let calls = 0;
  const run = async () => (++calls === 1 ? 'garbage' : GOOD);
  const { result } = await review('p', { run });
  assert.equal(calls, 2);
  assert.ok(result);
});

test('review returns null result after two bad responses', async () => {
  const { result, raw } = await review('p', { run: async () => 'still garbage' });
  assert.equal(result, null);
  assert.equal(raw, 'still garbage');
});

test('classify flags secrets and noise', () => {
  assert.equal(classify('.env'), 'secret');
  assert.equal(classify('config/.env.production'), 'secret');
  assert.equal(classify('certs/server.pem'), 'secret');
  assert.equal(classify('package-lock.json'), 'noise');
  assert.equal(classify('dist/app.min.js'), 'noise');
  assert.equal(classify('src/index.js'), 'ok');
});

test('getStagedDiff excludes secret files and truncates large diffs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gitreview-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  writeFileSync(join(dir, '.env'), 'API_KEY=supersecret\n');
  writeFileSync(join(dir, 'big.txt'), 'line\n'.repeat(5000));
  git('add', '-A');
  const cwd = process.cwd();
  process.chdir(dir);
  try {
    const r = getStagedDiff({ maxBytes: 1000 });
    assert.deepEqual(r.included, ['big.txt']);
    assert.equal(r.skipped[0].file, '.env');
    assert.ok(!r.diff.includes('supersecret'));
    assert.ok(r.truncated);
  } finally {
    process.chdir(cwd);
  }
});

test('render prints findings by severity and the commit message', () => {
  const lines = [];
  render(parseReview(GOOD), (s) => lines.push(s));
  const text = lines.join('\n');
  assert.ok(text.indexOf('HIGH') < text.indexOf('LOW'));
  assert.ok(text.includes('fix(db): parameterize query'));
});
