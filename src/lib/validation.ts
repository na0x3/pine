import { z } from 'zod';

export const decisionSchema = z.object({
  decision: z.enum(['CLOSE', 'REQUEST_INFORMATION', 'ESCALATE', 'SUSPICIOUS_ACTIVITY_REVIEW']),
  note: z.string().trim().min(10, 'Add a note of at least 10 characters').max(4000),
});

export const investigationSchema = z.object({
  summary: z.string(),
  risk_factors: z.array(z.object({ title: z.string(), severity: z.enum(['low', 'medium', 'high', 'critical']), explanation: z.string(), evidence_ids: z.array(z.string()) })),
  mitigating_factors: z.array(z.object({ title: z.string(), explanation: z.string(), evidence_ids: z.array(z.string()) })),
  behavioral_anomalies: z.array(z.object({ title: z.string(), explanation: z.string(), severity: z.enum(['low', 'medium', 'high']) })),
  missing_information: z.array(z.object({ field: z.string(), reason_needed: z.string() })),
  recommended_action: z.enum(['close', 'request_information', 'escalate', 'suspicious_activity_review']),
  recommendation_reasoning: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type InvestigationOutput = z.infer<typeof investigationSchema>;
