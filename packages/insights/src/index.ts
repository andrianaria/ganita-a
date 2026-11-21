import { z } from "zod";

export const insightOutputSchema = z.object({
  summary: z.string().min(1),
  explanation: z.string().min(1),
  recommendedActions: z.array(z.object({ label: z.string().min(1), priority: z.enum(["LOW", "MEDIUM", "HIGH"]) })).min(3).max(5)
});

export type InsightOutput = z.infer<typeof insightOutputSchema>;

export interface InsightEvidence {
  outlet: string;
  issueType: string;
  metricName: string;
  currentValue?: number;
  previousValue?: number;
  targetValue?: number;
  estimatedImpact?: number;
  drivers?: Array<{ name: string; changePct?: number; value?: number }>;
}

export interface LLMProvider {
  generateInsight(evidence: InsightEvidence): Promise<InsightOutput>;
}

export class MockInsightProvider implements LLMProvider {
  async generateInsight(evidence: InsightEvidence): Promise<InsightOutput> {
    return {
      summary: `${evidence.outlet} needs attention on ${evidence.metricName}.`,
      explanation: "This recommendation is based on deterministic health metrics already calculated by Ganita AI.",
      recommendedActions: [
        { label: "Review the top products contributing to the issue.", priority: "HIGH" },
        { label: "Compare supplier cost and waste records for the same period.", priority: "MEDIUM" },
        { label: "Check whether promotions or discounts are masking margin pressure.", priority: "MEDIUM" }
      ]
    };
  }
}
