import type { IProductService } from '../productService';
import { sampleModels } from './sampleUnits';

/** The Models sample behind IProductService: development builds only (VITE_DEMO_DATA=product). */
export class SampleProductService implements IProductService {
  constructor(private readonly delayMs = 300) {}

  models = () =>
    new Promise<ReturnType<typeof sampleModels>>((resolve) =>
      setTimeout(() => resolve(sampleModels()), this.delayMs),
    );
}
