import chalk from 'chalk';

const ORDER = { high: 0, medium: 1, low: 2 };
const COLOR = { high: chalk.red.bold, medium: chalk.yellow.bold, low: chalk.cyan };
const RULE = chalk.dim('-'.repeat(40));

export function render({ findings, commit_message }, out = console.log) {
  const sorted = [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  if (sorted.length === 0) {
    out(chalk.green('No issues found in the staged changes.'));
  } else {
    out(chalk.bold(`Findings (${sorted.length})`));
    for (const f of sorted) {
      const loc = f.file ? `${f.file}${f.line ? ':' + f.line : ''}` : '';
      out(`\n${COLOR[f.severity](`[${f.severity.toUpperCase()}]`)} ${chalk.dim(loc)}`);
      out(`  ${f.issue}`);
      if (f.suggestion) out(chalk.dim(`  -> ${f.suggestion}`));
    }
  }
  out(`\n${chalk.bold('Proposed commit message')}\n${RULE}\n${commit_message}\n${RULE}`);
}
