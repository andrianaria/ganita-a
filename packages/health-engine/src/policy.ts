export interface HealthPolicy {
  version: string;
  targets: {
    hppPercentage: number;
    opexPercentage: number;
    discountPercentage: number;
    salesDeclinePercentage: number;
    marginDeclinePercentage: number;
    aovDeclinePercentage: number;
    netMarginPercentage?: number;
  };
  weights: {
    revenue: number;
    margin: number;
    cost: number;
    operations: number;
  };
}

export const mvpHealthPolicy: HealthPolicy = {
  version: "mvp-v1",
  targets: {
    hppPercentage: 40,
    opexPercentage: 30,
    discountPercentage: 12,
    salesDeclinePercentage: 15,
    marginDeclinePercentage: 6,
    aovDeclinePercentage: 10
  },
  weights: {
    revenue: 0.25,
    margin: 0.35,
    cost: 0.25,
    operations: 0.15
  }
};

export function policyFromSettings(settings: unknown): HealthPolicy {
  const targets = (settings as { targets?: Record<string, unknown> } | null)?.targets;
  if (!targets) return mvpHealthPolicy;
  const number = (key: string, fallback: number) => {
    const value = Number(targets[key]);
    return targets[key] !== "" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : fallback;
  };
  const foodCost = Math.max(1, number("foodCost", mvpHealthPolicy.targets.hppPercentage));
  const margin = number("margin", 24);
  return { ...mvpHealthPolicy, version: `organization-v1:hpp=${foodCost}:margin=${margin}`,
    targets: { ...mvpHealthPolicy.targets, hppPercentage: foodCost, netMarginPercentage: margin } };
}
