// Usage: node tools/scripts/demoOwnerCheck.ts <path to owner.conf>. Exits 1 if the file is missing or either demo owner
// variable is missing or empty. Prints variable names only, never a value.
import { existsSync, readFileSync } from 'node:fs';
import { ownerConfProblems } from '../src/demoGuard.ts';

const path = process.argv[2] ?? '.demo/owner.conf';
if (!existsSync(path)) {
  process.stderr.write(
    `owner.conf not found at ${path}: create it with DEMO_OWNER_EMAIL and DEMO_OWNER_PASSWORD.\n`,
  );
  process.exit(1);
}
const problems = ownerConfProblems(readFileSync(path, 'utf8'));
if (problems.length > 0) {
  process.stderr.write(`${path}: ${problems.join('; ')}.\n`);
  process.exit(1);
}
