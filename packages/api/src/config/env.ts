import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  JWT_SECRET: z.string().min(32).max(64),

  // used by the roblox game
  VERIFICATION_SECRET: z.string().min(64),
  VERIFICATION_PLACE_ID: z.string().regex(/^\d+$/, "Must be a Roblox place id"),

  CHAT_DEFAULT_MAX_MESSAGE_LENGTH: z.coerce
    .number()
    .int()
    .positive()
    .default(280),
  CHAT_DEFAULT_RATE_LIMIT_COUNT: z.coerce.number().int().positive().default(4),
  CHAT_DEFAULT_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5000),
  CHAT_LIMITS_OVERRIDES: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    "Invalid environment variables on BACKEND:",
    parsedEnv.error.format(),
  );
  process.exit(1);
}

export const env = parsedEnv.data;
