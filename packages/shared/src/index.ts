export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccessEnvelope<T> {
  data: T;
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function percentage(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator === 0) return 0;
  return round((numerator / denominator) * 100, 4);
}
