// Usage: node tools/scripts/demoGuardUrl.ts <VARIABLE>... Each named variable must hold a database URL for the demo4
// database (tools/src/demoGuard.ts). The URL is read from the environment, so it never appears on a command line,
// and it is never printed: only host, port and database name appear in a refusal.
import { demoUrlProblems } from '../src/demoGuard.ts';

let failed = false;
for (const name of process.argv.slice(2)) {
  const url = process.env[name];
  const problems = url ? demoUrlProblems(url) : [`${name} is not set`];
  if (problems.length > 0) {
    failed = true;
    process.stderr.write(
      `The demo refuses ${name}: ${problems.join('; ')}. Only erp_demo4 on 127.0.0.1:55444.\n`,
    );
  }
}
if (failed) process.exit(1);
