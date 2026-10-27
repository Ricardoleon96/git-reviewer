import { execFileSync } from 'node:child_process';

// Files whose contents should never be sent to the model.
const SECRET_RE = /(^|\/)(\.env(\..*)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)|\.npmrc|credentials(\.json)?)$/i;
// Noisy generated files: reviewing them wastes tokens.
const NOISE_RE = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|poetry\.lock)$|\.min\.(js|css)$|\.map$/i;

function git(args, opts = {}) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

export function assertRepo() {
  try {
    git(['rev-parse', '--is-inside-work-tree']);
  } catch {
    throw new Error('Not inside a Git repository.');
  }
}

export function stagedFiles() {
  // -z gives NUL-separated, unquoted paths (safe for spaces/unicode).
  return git(['diff', '--staged', '--name-only', '-z']).split('\0').filter(Boolean);
}

export function classify(file) {
  if (SECRET_RE.test(file)) return 'secret';
  if (NOISE_RE.test(file)) return 'noise';
  return 'ok';
}

/**
 * Returns { diff, included, skipped, truncated }.
 * Skipped files are excluded from the diff via pathspec, so they never leave the machine.
 */
export function getStagedDiff({ maxBytes = 100_000 } = {}) {
  const files = stagedFiles();
  const included = [];
  const skipped = [];
  for (const f of files) {
    const kind = classify(f);
    (kind === 'ok' ? included : skipped).push(kind === 'ok' ? f : { file: f, reason: kind });
  }
  if (files.length === 0) return { diff: '', included, skipped, truncated: false };
  if (included.length === 0) return { diff: '', included, skipped, truncated: false };

  // `--` pathspec with literal paths; :(literal) stops glob interpretation.
  const diff = git(['diff', '--staged', '--no-color', '--', ...included.map((f) => `:(literal)${f}`)]);
  if (Buffer.byteLength(diff) <= maxBytes) return { diff, included, skipped, truncated: false };
  const cut = Buffer.from(diff).subarray(0, maxBytes).toString('utf8').replace(/\n[^\n]*$/, '');
  return { diff: cut + '\n[... diff truncated ...]\n', included, skipped, truncated: true };
}
