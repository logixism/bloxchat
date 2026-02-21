import { env } from "./env";
import type { ChatLimits } from "../types";

const defaultLimits: ChatLimits = {
  maxMessageLength: env.CHAT_DEFAULT_MAX_MESSAGE_LENGTH,
  rateLimitCount: env.CHAT_DEFAULT_RATE_LIMIT_COUNT,
  rateLimitWindowMs: env.CHAT_DEFAULT_RATE_LIMIT_WINDOW_MS,
};

const parseOverrides = (): Record<string, Partial<ChatLimits>> => {
  if (!env.CHAT_LIMITS_OVERRIDES) return {};

  try {
    const parsed = JSON.parse(env.CHAT_LIMITS_OVERRIDES) as Record<
      string,
      Partial<ChatLimits>
    >;
    return parsed;
  } catch {
    console.error("Invalid CHAT_LIMITS_OVERRIDES JSON. Falling back to defaults.");
    return {};
  }
};

const overrides = parseOverrides();

const toLimit = (value: unknown, fallback: number) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
};

export const getChatLimitsForChannel = (channel: string): ChatLimits => {
  const override = overrides[channel];
  if (!override) return defaultLimits;

  return {
    maxMessageLength: toLimit(
      override.maxMessageLength,
      defaultLimits.maxMessageLength,
    ),
    rateLimitCount: toLimit(override.rateLimitCount, defaultLimits.rateLimitCount),
    rateLimitWindowMs: toLimit(
      override.rateLimitWindowMs,
      defaultLimits.rateLimitWindowMs,
    ),
  };
};
