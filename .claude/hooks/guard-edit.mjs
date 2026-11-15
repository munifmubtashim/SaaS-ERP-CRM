// PreToolUse (Edit|Write|MultiEdit|NotebookEdit): blocks edits that break the "Never do" list.
//  - a migration that has already reached origin/main (roadmap 8.3, 10.4)
//  - any .env file except .env.example, and anything under data/real/
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { block, isSecretEnvName, projectDir, readHookInput, repoRelative } from './lib.mjs';

const input = readHookInput();
const filePath = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
const rel = repoRelative(filePath);
if (!rel) process.exit(0);

if (isSecretEnvName(path.posix.basename(rel))) {
  block(
    `Blocked: ${rel} holds secrets. Edit .env.example instead and tell the developer which value to set.`,
  );
}

if (rel.startsWith('data/real/')) {
  block('Blocked: data/real/ holds real customer data. Work with the anonymised dataset instead.');
}

if (
  rel.startsWith('packages/backend/src/dal/prisma/migrations/') &&
  rel !== 'packages/backend/src/dal/prisma/migrations/migration_lock.toml'
) {
  if (existsOnMain(rel)) {
    block(
      `Blocked: ${rel} is already on main. Never edit a migration that has reached main. ` +
        'Change the schema file and create a NEW migration with /add-migration.',
    );
  }
}

process.exit(0);

function existsOnMain(relPath) {
  for (const ref of ['origin/main', 'main']) {
    try {
      execFileSync('git', ['cat-file', '-e', `${ref}:${relPath}`], { cwd: projectDir, stdio: 'ignore' });
      return true;
    } catch {
      // not on this ref (or the ref does not exist): try the next one
    }
  }
  return false;
}
