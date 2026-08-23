import { z } from "zod";
import { plateItemSchema } from "./scan";

/**
 * Voice-log result schema. Item shape mirrors plateItemSchema so the
 * client can post the same items array straight into /api/ledger/add
 * without a re-mapping step.
 */
export const voiceLogItemSchema = plateItemSchema.extend({
  confidence: z.enum(["low", "medium", "high"]).optional(),
});

export const voiceLogResultSchema = z.object({
  transcript_echo: z.string().max(1000),
  items: z.array(voiceLogItemSchema).max(15),
  notes: z.string().max(300).optional(),
});

export type VoiceLogItem = z.infer<typeof voiceLogItemSchema>;
export type VoiceLogResult = z.infer<typeof voiceLogResultSchema>;
