/** What InventoryManager needs from the database besides the stock reads. Owned by businessLogic; dal's InventoryQuery satisfies it. */
export interface IInventoryQuery {
  /** The business's walk-in party (ADR 0019), or null. */
  walkInPartyId(): Promise<string | null>;
}
