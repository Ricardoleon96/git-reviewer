# git-review

Reviews your **staged** changes with Claude (via the `claude -p` CLI) and proposes a
[Conventional Commits](https://www.conventionalcommits.org/) message. It never commits for you.

## Install

Requires Node >= 18 and the [Claude Code](https://claude.com/claude-code) CLI, logged in.

```
npm install
npm link        # puts `git-review` on your PATH (also enables `git review`)
```

## Usage

```
git add -p
git-review                 # human-readable report
git-review --json          # machine-readable result on stdout
git-review --model sonnet  # pass a model alias/name to claude
git-review --max-bytes 50000
```

Exit codes: `0` ok, `1` usage/environment error, `2` unparseable model output, `3` at least one HIGH finding.

## Privacy and safety

- The staged diff is sent to Anthropic through Claude Code. Nothing else is read from your repo.
- Secret-like files (`.env*`, `*.pem`, `*.key`, SSH keys, `.npmrc`, `credentials*`) and noisy files
  (lockfiles, minified files, source maps) are excluded from the diff before it is sent.
- Claude runs with all tools disabled, so it can only read the diff and answer.
- Diffs over `--max-bytes` (default 100000) are truncated, with a warning.

## Develop

```
npm test
```
