import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  ROBLOX_CLIENT_ID: z.string().nonempty(),
  ROBLOX_SECRET_KEY: z.string().nonempty(),
  JWT_SECRET: z.string().min(32).max(64),
  CHAT_DEFAULT_MAX_MESSAGE_LENGTH: z.coerce.number().int().positive().default(280),
  CHAT_DEFAULT_RATE_LIMIT_COUNT: z.coerce.number().int().positive().default(4),
  CHAT_DEFAULT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(5000),
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
