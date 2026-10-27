#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { assertRepo, getStagedDiff } from '../src/git.js';
import { buildPrompt } from '../src/prompt.js';
import { review } from '../src/claude.js';
import { render } from '../src/render.js';

const program = new Command();
program
  .name('git-review')
  .description('Review staged changes with Claude and propose a conventional commit message')
  .option('--json', 'print raw JSON result')
  .option('--max-bytes <n>', 'max diff size sent to the model', (v) => parseInt(v, 10), 100_000)
  .option('--model <model>', 'model alias or name passed to claude')
  .parse();
const opts = program.opts();

const log = (...a) => console.error(...a); // keep stdout clean for --json

try {
  assertRepo();
  const { diff, included, skipped, truncated } = getStagedDiff({ maxBytes: opts.maxBytes });

  for (const s of skipped) log(chalk.dim(`skipped ${s.file} (${s.reason})`));
  if (included.length === 0) {
    log(skipped.length ? 'Only skipped files are staged; nothing to review.' : 'Nothing staged. Use `git add` first.');
    process.exit(1);
  }
  if (truncated) log(chalk.yellow(`Warning: diff exceeded ${opts.maxBytes} bytes and was truncated; review is partial.`));
  log(chalk.dim(`Sending staged diff for ${included.length} file(s) to Claude via \`claude -p\`...`));

  const { result, raw } = await review(buildPrompt(diff), { model: opts.model });
  if (!result) {
    log(chalk.red('Could not parse a structured review. Raw model output:'));
    console.log(raw);
    process.exit(2);
  }
  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else render(result);
  process.exit(result.findings.some((f) => f.severity === 'high') ? 3 : 0);
} catch (e) {
  log(chalk.red(`git-review: ${e.message}`));
  process.exit(1);
}
