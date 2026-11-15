// Shared helpers for the Claude Code hooks in this folder. Plain Node, no dependencies, any OS.
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Hook input arrives as JSON on stdin. */
export function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

export const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

/** Path relative to the repo root with forward slashes, or null when outside the repo. */
export function repoRelative(filePath) {
  if (!filePath) return null;
  const rel = path.relative(projectDir, path.resolve(projectDir, filePath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** Exit code 2 blocks a PreToolUse call; for PostToolUse it sends stderr back to Claude. */
export function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

/** True for .env, .env.local, .env.production, ... but not .env.example. */
export function isSecretEnvName(name) {
  return /^\.env(\..+)?$/.test(name) && name !== '.env.example';
}
