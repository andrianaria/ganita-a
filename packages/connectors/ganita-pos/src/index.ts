import type { ExternalTransaction, POSConnector } from "@ganita-ai/connectors-core";

export interface GanitaPosConnectorConfig {
  readonly baseUrl?: string;
  readonly secretRef?: string;
}

export class GanitaPosConnector implements POSConnector {
  constructor(private readonly config: GanitaPosConnectorConfig) {}

  async testConnection() {
    return Boolean(this.config.baseUrl || this.config.secretRef);
  }

  async getOutlets() {
    return [];
  }

  async getTransactions(): Promise<{ data: ExternalTransaction[] }> {
    // Implement after Ganita POS API contract is available; health logic must stay decoupled.
    return { data: [] };
  }

  async getProducts() {
    return [];
  }
}
