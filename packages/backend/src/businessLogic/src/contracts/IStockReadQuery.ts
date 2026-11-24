/** What InventoryManager reads from the stock ledger (Munif, 24 Nov). Owned here; dal's StockQuery satisfies it. */
export interface StockRowRead {
  productId: string;
  productCode: string;
  productName: string;
  branchId: string;
  branchName: string;
  onHand: string;
}

export interface PosCatalogItemRead {
  productId: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  tracking: string;
  sellPrice: string;
  isPassThrough: boolean;
  onHand: string;
  units: { id: string; serialNo: string }[];
}

export interface IStockReadQuery {
  stockRows(filter: {
    search?: string | undefined;
    branchId: string | null;
    after: { productId: string; branchId: string } | null;
    limit: number;
  }): Promise<StockRowRead[]>;
  posCatalogItems(branchId: string): Promise<PosCatalogItemRead[]>;
}
