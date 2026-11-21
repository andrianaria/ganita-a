import type { ExternalTransaction, POSConnector } from "@ganita-ai/connectors-core";

export interface StreetSushiConnectorConfig {
  readonly endpoint?: string;
  readonly secretRef?: string;
}

export class StreetSushiConnector implements POSConnector {
  constructor(private readonly config: StreetSushiConnectorConfig) {}

  async testConnection() {
    return Boolean(this.config.endpoint || this.config.secretRef);
  }

  async getOutlets() {
    return [
      { externalId: "grand-wisata", name: "Demo Outlet A", code: "GW", timezone: "Asia/Jakarta" },
      { externalId: "j-town", name: "Demo Outlet B", code: "JT", timezone: "Asia/Jakarta" },
      { externalId: "teraskota", name: "Demo Outlet C", code: "TK", timezone: "Asia/Jakarta" },
      { externalId: "city", name: "City", code: "CT", timezone: "Asia/Jakarta" },
      { externalId: "sindang-jaya", name: "Demo Outlet E", code: "SJ", timezone: "Asia/Jakarta" }
    ];
  }

  async getTransactions(): Promise<{ data: ExternalTransaction[] }> {
    // Real mapping belongs here after the Street Sushi read-only API/schema is inspected.
    return { data: [] };
  }

  async getProducts() {
    return [];
  }
}
