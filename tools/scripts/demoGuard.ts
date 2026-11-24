// Usage: node tools/scripts/demoGuard.ts <container> <port> <volume> <database>. Exits 1, saying why, unless the
// target is the demo4 database (tools/src/demoGuard.ts). demo-reset.sh runs it before any docker command.
import { assertDemoTarget } from '../src/demoGuard.ts';

const [container = '', port = '', volume = '', database = ''] = process.argv.slice(2);
try {
  assertDemoTarget({ container, port, volume, database });
} catch (error) {
  process.stderr.write(`${(error as Error).message}\n`);
  process.exit(1);
}
