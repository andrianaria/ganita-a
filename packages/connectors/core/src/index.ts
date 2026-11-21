export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: string;
}

export interface ExternalOutlet {
  externalId: string;
  name: string;
  code?: string;
  timezone?: string;
}

export interface ExternalProduct {
  externalId: string;
  name: string;
  sku?: string;
  category?: string;
  sellingPrice?: number;
  estimatedCost?: number;
  active?: boolean;
}

export interface ExternalIngredient {
  externalId: string;
  name: string;
  unit: string;
  currentCost?: number;
}

export interface ExternalRecipeItem {
  ingredientExternalId: string;
  quantity: number;
  unit: string;
  estimatedCost?: number;
}

export interface ExternalRecipe {
  externalId: string;
  productExternalId: string;
  name: string;
  version?: number;
  yieldQuantity?: number;
  yieldUnit?: string;
  items: ExternalRecipeItem[];
}

export interface ExternalStockLocation {
  externalId: string;
  outletExternalId?: string;
  name: string;
  type: "OUTLET" | "WAREHOUSE" | "COMMISSARY" | "VIRTUAL";
}

export interface ExternalStockBalance {
  stockLocationExternalId: string;
  ingredientExternalId: string;
  onHandQuantity: number;
  reservedQuantity?: number;
  unit: string;
  averageUnitCost?: number;
}

export interface ExternalStockMovement {
  externalId?: string;
  outletExternalId?: string;
  stockLocationExternalId: string;
  ingredientExternalId: string;
  type: "PURCHASE" | "SALE_USAGE" | "WASTE" | "TRANSFER_IN" | "TRANSFER_OUT" | "ADJUSTMENT" | "PRODUCTION" | "RETURN";
  occurredAt: Date;
  quantity: number;
  unit: string;
  unitCost?: number;
  totalCost?: number;
  referenceType?: string;
  referenceId?: string;
  reason?: string;
}

export interface ExternalTransactionItem {
  externalId?: string;
  productExternalId?: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  discountAmount: number;
  netAmount: number;
  unitCost?: number;
  totalCost?: number;
}

export interface ExternalTransaction {
  externalId: string;
  transactionNumber?: string;
  outletExternalId: string;
  occurredAt: Date;
  grossSales: number;
  discountAmount: number;
  serviceCharge: number;
  taxAmount: number;
  netSales: number;
  totalCost?: number;
  paymentMethod?: string;
  status: string;
  items: ExternalTransactionItem[];
}

export interface ExternalExpense {
  externalId?: string;
  outletExternalId: string;
  expenseDate: Date;
  category: string;
  amount: number;
  description?: string;
}

export interface POSConnector {
  testConnection(): Promise<boolean>;
  getOutlets(): Promise<ExternalOutlet[]>;
  getTransactions(params: {
    outletId: string;
    from: Date;
    to: Date;
    cursor?: string;
  }): Promise<PaginatedResult<ExternalTransaction>>;
  getProducts(params: { outletId?: string }): Promise<ExternalProduct[]>;
  getIngredients?(params: { outletId?: string }): Promise<ExternalIngredient[]>;
  getRecipes?(params: { outletId?: string }): Promise<ExternalRecipe[]>;
  getStockLocations?(): Promise<ExternalStockLocation[]>;
  getStockBalances?(params: { outletId?: string; stockLocationId?: string }): Promise<ExternalStockBalance[]>;
  getStockMovements?(params: {
    outletId?: string;
    stockLocationId?: string;
    from: Date;
    to: Date;
    cursor?: string;
  }): Promise<PaginatedResult<ExternalStockMovement>>;
  getExpenses?(params: { outletId: string; from: Date; to: Date }): Promise<ExternalExpense[]>;
}
