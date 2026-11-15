// PreToolUse (Bash): a second line of defence behind the deny rules in settings.json, which match
// only simple command shapes. Blocks force-push, pushes to main, --no-verify, reading .env files or
// data/real/, and commands aimed at production.
import { block, isSecretEnvName, readHookInput } from './lib.mjs';

const command = String(readHookInput().tool_input?.command ?? '');
if (!command) process.exit(0);

// Split on shell separators so "a && git push -f" is caught too.
const segments = command.split(/&&|\|\||;|\||\n/).map((s) => s.trim());

for (const seg of segments) {
  const words = seg.split(/\s+/);
  if (/^git\s+(.+\s)?push\b/.test(seg)) {
    if (
      words.some(
        (w) => w === '-f' || w === '--force' || w.startsWith('--force-with-lease') || w === '--mirror',
      )
    ) {
      block(
        'Blocked: force-push is never allowed (CLAUDE.md "Never do"). Merge main into your branch instead.',
      );
    }
    if (words.some((w) => /^\+/.test(w))) {
      block('Blocked: a "+refspec" push is a force-push.');
    }
    if (words.some((w) => /^(main|HEAD:main|[^:]*:main|refs\/heads\/main|:main)$/.test(w))) {
      block('Blocked: never push to main. Open a pull request from your dev branch.');
    }
  }
  if (/^gh\s+pr\s+merge\b/.test(seg)) {
    block('Blocked: merging is done by a human after the other developer approves.');
  }
}

if (/(^|\s)--no-verify(\s|$)/.test(command)) {
  block('Blocked: --no-verify skips the safety hooks. Fix the failing check instead.');
}

// .env files: block commands that READ one (print, search, source, copy out, redirect in).
// Mentioning ".env" elsewhere (a path string in a file being written, `cp .env.example .env`) is fine.
const READERS = new Set([
  'cat',
  'less',
  'more',
  'head',
  'tail',
  'grep',
  'egrep',
  'rg',
  'ag',
  'awk',
  'sed',
  'cut',
  'sort',
  'uniq',
  'strings',
  'xxd',
  'od',
  'hexdump',
  'bat',
  'nl',
  'tac',
  'source',
  '.',
  'cp',
  'mv',
  'scp',
  'rsync',
  'base64',
  'openssl',
  'diff',
  'cmp',
  'jq',
  'yq',
  'dotenv',
  'env-cmd',
  'tee',
  'vi',
  'vim',
  'nano',
  'code',
  'open',
]);
const pathIsSecretEnv = (word) =>
  isSecretEnvName(
    word
      .replace(/^['"]|['"]$/g, '')
      .split('/')
      .pop() ?? '',
  );
// Also look inside $(...) and backticks, e.g. export $(cat .env).
const pieces = command.split(/&&|\|\||;|\||\n|\$\(|`/).map((s) => s.trim());
for (const piece of pieces) {
  const [cmd, ...args] = piece.split(/\s+/);
  if (cmd && READERS.has(cmd) && args.some(pathIsSecretEnv)) {
    if (cmd === 'cp' && args.filter((a) => !a.startsWith('-'))[0] === '.env.example') continue; // setup copy
    block('Blocked: commands may not read or print .env files. Ask the developer for the value you need.');
  }
}
if (/<\s*['"]?(?:[\w./-]*\/)?\.env(?:\.(?!example\b)[\w.-]+)?['"]?(?:\s|$)/.test(command)) {
  block('Blocked: commands may not read .env files (input redirection).');
}

if (/(^|[\s/'"])data\/real(\/|\s|$)/.test(command)) {
  block('Blocked: data/real/ holds real customer data and is off limits to Claude sessions.');
}

// Production: Claude never deploys, restores, migrates or connects to production. Checked per command
// line, and only for lines that run a deploy/database tool, so prose in a heredoc does not trip it.
const TOOLS =
  /^(\w+=\S*\s+)*(npm|npx|node|tsx|prisma|psql|pg_dump|pg_restore|ssh|scp|rsync|kubectl|flyctl|fly|railway|vercel|docker|gh|curl|ansible|terraform)\b/;
const riskyVerb =
  /\b(deploy|migrate|psql|pg_dump|pg_restore|ssh|scp|rsync|kubectl|flyctl|railway|vercel|DATABASE_URL|restore|apply)\b/i;
for (const piece of pieces) {
  const prod = /\b(prod|production)\b/i.test(piece);
  if (prod && (TOOLS.test(piece) || /\bDATABASE_URL=/.test(piece)) && riskyVerb.test(piece)) {
    block('Blocked: anything touching production runs from CI or by a human, never from a Claude session.');
  }
}

process.exit(0);
