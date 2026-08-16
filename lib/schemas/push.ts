import { z } from "zod";

export const registerPushSchema = z.object({
  expo_token: z.string().min(10).max(200),
  platform: z.enum(["ios", "android"]),
});

export type RegisterPushInput = z.infer<typeof registerPushSchema>;
