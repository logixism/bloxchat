import { z } from "zod";
import { config } from "dotenv";

config();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  ROBLOX_CLIENT_ID: z.string().nonempty(),
  ROBLOX_SECRET_KEY: z.string().nonempty(),
  JWT_SECRET: z.string().min(32).max(64),
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
