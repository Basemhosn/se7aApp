import { z } from "zod";

export const attachReferralSchema = z.object({
  referral_code: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{6,12}$/, "invalid referral code"),
});

export type AttachReferralInput = z.infer<typeof attachReferralSchema>;
