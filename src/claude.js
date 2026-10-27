import { spawn } from 'node:child_process';
import { SYSTEM_PROMPT } from './prompt.js';

const SEVERITIES = new Set(['high', 'medium', 'low']);

/** Spawn `claude -p`, feeding the prompt over stdin (avoids Windows arg-length limits). */
export function runClaude(prompt, { model, timeoutMs = 180_000, bin = 'claude' } = {}) {
  const args = ['-p', '--tools', '', '--no-session-persistence', '--output-format', 'text', '--system-prompt', SYSTEM_PROMPT];
  if (model) args.push('--model', model);
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`claude timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new Error('`claude` CLI not found on PATH. Install Claude Code and log in first.') : e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude exited with code ${code}: ${(err || out).trim().slice(0, 500)}`));
      else resolve(out);
    });
    child.stdin.on('error', () => {}); // EPIPE if claude dies early; surfaced via close
    child.stdin.end(prompt);
  });
}

/** Pull the first balanced JSON object out of text and validate its shape. */
export function parseReview(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('no JSON object in response');
  const obj = JSON.parse(text.slice(start, end + 1));
  if (typeof obj.commit_message !== 'string' || !Array.isArray(obj.findings)) throw new Error('response missing findings/commit_message');
  obj.findings = obj.findings
    .filter((f) => f && typeof f.issue === 'string')
    .map((f) => ({
      severity: SEVERITIES.has(f.severity) ? f.severity : 'low',
      file: String(f.file ?? ''),
      line: Number.isInteger(f.line) ? f.line : null,
      issue: f.issue,
      suggestion: typeof f.suggestion === 'string' ? f.suggestion : '',
    }));
  return obj;
}

/** Run + parse, retrying once on malformed output. `run` is injectable for tests. */
export async function review(prompt, { run = runClaude, ...opts } = {}) {
  let raw = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    raw = await run(prompt, opts);
    try {
      return { result: parseReview(raw), raw };
    } catch {
      /* retry once */
    }
  }
  return { result: null, raw };
}
