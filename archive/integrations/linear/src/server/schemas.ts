import { z } from "zod";

// ============================================================
// API request schemas
// ============================================================

export const oauthRevokeSchema = z.object({
  organizationId: z.string().min(1, { error: "organizationId is required" }),
});

// ============================================================
// Outbound activity schemas (for internal validation)
// ============================================================

export const outboundActivityContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("thought"), body: z.string() }),
  z.object({
    type: z.literal("action"),
    action: z.string(),
    parameter: z.string(),
    result: z.string().optional(),
  }),
  z.object({ type: z.literal("elicitation"), body: z.string() }),
  z.object({ type: z.literal("response"), body: z.string() }),
  z.object({ type: z.literal("error"), body: z.string() }),
]);

export const agentActivityCreateInputSchema = z.object({
  agentSessionId: z.string(),
  content: outboundActivityContentSchema,
  ephemeral: z.boolean().optional(),
  signal: z.enum(["auth", "select"]).optional(),
  signalMetadata: z.record(z.string(), z.unknown()).optional(),
});
