// PostToolUse (Edit|Write|MultiEdit): lint the edited file and typecheck its workspace.
// On failure, exit 2 so the errors go back to Claude to fix straight away.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { block, projectDir, readHookInput, repoRelative } from './lib.mjs';

const input = readHookInput();
const rel = repoRelative(input.tool_input?.file_path);
if (!rel || !/\.(ts|tsx|mts|cts|js|mjs|jsx)$/.test(rel)) process.exit(0);
if (/(^|\/)(node_modules|dist|generated)\//.test(rel)) process.exit(0);

const absFile = path.join(projectDir, rel);
const workspace = findWorkspace(path.dirname(absFile));
const problems = [];

const lint = run(['eslint', '--max-warnings=0', absFile], workspace ?? projectDir);
if (lint.status !== 0) problems.push(`ESLint (${rel}):\n${lint.output}`);

// Each workspace's own "typecheck" script (tsc -p for backend/shared, tsc -b for the frontend).
if (workspace && hasScript(workspace, 'typecheck')) {
  const tsc = runNpm(['run', '--silent', 'typecheck'], workspace);
  if (tsc.status !== 0) {
    problems.push(`TypeScript (${path.relative(projectDir, workspace)}):\n${tsc.output}`);
  }
}

if (problems.length > 0) block(problems.join('\n\n').slice(0, 8000));
process.exit(0);

/** Nearest folder with a package.json, below the repo root. */
function findWorkspace(dir) {
  let current = dir;
  while (current.startsWith(projectDir) && current !== projectDir) {
    if (existsSync(path.join(current, 'package.json'))) return current;
    current = path.dirname(current);
  }
  return null;
}

function run(args, cwd) {
  return spawn('npx', ['--no-install', ...args], cwd);
}

function runNpm(args, cwd) {
  return spawn('npm', args, cwd);
}

function spawn(cmd, args, cwd) {
  const result = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' });
  return { status: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function hasScript(dir, name) {
  try {
    return Boolean(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).scripts?.[name]);
  } catch {
    return false;
  }
}
