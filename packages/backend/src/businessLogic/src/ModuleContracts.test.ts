import { FakePostingService } from './test/FakePostingService.js';
import { FakeStockService } from './test/FakeStockService.js';
import { postingContract } from './test/postingContract.js';
import { stockContract } from './test/stockContract.js';

/** ADR 0012 section 5: the fakes pass the same contract suites the real services will (ADR 0013, ADR 0021). */
postingContract('FakePostingService', async (options) => {
  const service = new FakePostingService(options);
  return { service, journalCount: async () => service.journals.length };
});

stockContract('FakeStockService', async () => {
  const service = new FakeStockService();
  return { service, onHand: async (productId, branchId) => service.onHand(productId, branchId) };
});
