import z from "zod";
import { gameVerificationProcedure, publicProcedure, t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { env } from "../config/env";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { JwtUser } from "../types";
import { fetchRobloxUserProfile } from "../services/roblox";
import { ratelimit } from "../services/rateLimit";
import { getVerificationConfig } from "../config/verification";

type AuthSession = {
  jwt: string;
  user: JwtUser;
};

type VerificationSession = {
  sessionId: string;
  code: string;
  expiresAt: number;
  completedSession: AuthSession | null;
};

const verificationSessions = new Map<string, VerificationSession>();
const verificationCodes = new Map<string, string>();
const refreshBuckets = new Map<string, number[]>();
const gameVerificationBuckets = new Map<string, number[]>();
const checkVerificationBuckets = new Map<string, number[]>();

const SESSION_TTL_MS = 10 * 60 * 1000;
const JWT_EXPIRY = "1h";
const REFRESH_RATE_LIMIT_COUNT = 4;
const REFRESH_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const GAME_VERIFY_RATE_LIMIT_COUNT = 20;
const GAME_VERIFY_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHECK_VERIFY_RATE_LIMIT_COUNT = 60;
const CHECK_VERIFY_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const JwtUserIdSchema = z.object({
  robloxUserId: z.string().regex(/^\d+$/, "Invalid user id"),
});

const GameVerificationInputSchema = z.object({
  code: z.string().trim().min(6).max(12),
  robloxUserId: z.string().regex(/^\d+$/, "Invalid user id"),
});

function cleanupExpiredVerificationSessions() {
  const now = Date.now();
  for (const [sessionId, session] of verificationSessions.entries()) {
    if (session.expiresAt > now) continue;
    verificationSessions.delete(sessionId);
    verificationCodes.delete(session.code);
  }
}

function randomVerificationCode() {
  const code = crypto.randomInt(100000, 1000000).toString();
  if (!verificationCodes.has(code)) return code;

  for (let i = 0; i < 10; i++) {
    const nextCode = crypto.randomInt(100000, 1000000).toString();
    if (!verificationCodes.has(nextCode)) return nextCode;
  }

  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

function buildSession(user: JwtUser): AuthSession {
  return {
    jwt: jwt.sign(user, env.JWT_SECRET, { expiresIn: JWT_EXPIRY }),
    user,
  };
}

export const authRouter = t.router({
  beginVerification: publicProcedure.mutation(() => {
    cleanupExpiredVerificationSessions();
    const verificationConfig = getVerificationConfig();

    const sessionId = crypto.randomUUID();
    const code = randomVerificationCode();
    const expiresAt = Date.now() + SESSION_TTL_MS;
    const session: VerificationSession = {
      sessionId,
      code,
      expiresAt,
      completedSession: null,
    };

    verificationSessions.set(sessionId, session);
    verificationCodes.set(code, sessionId);

    return {
      sessionId,
      code,
      expiresAt,
      placeId: verificationConfig.placeId,
    };
  }),

  completeVerification: gameVerificationProcedure
    .input(GameVerificationInputSchema)
    .mutation(async ({ input }) => {
      cleanupExpiredVerificationSessions();
      const rateLimitResult = ratelimit({
        buckets: gameVerificationBuckets,
        key: input.robloxUserId,
        limitCount: GAME_VERIFY_RATE_LIMIT_COUNT,
        limitWindowMs: GAME_VERIFY_RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimitResult.result) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit hit. Try again in ${Math.ceil(rateLimitResult.retryAfterMs / 1000)}s.`,
        });
      }

      const sessionId = verificationCodes.get(input.code);
      if (!sessionId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired verification code",
        });
      }

      const session = verificationSessions.get(sessionId);
      if (!session) {
        verificationCodes.delete(input.code);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid or expired verification code",
        });
      }

      if (session.expiresAt <= Date.now()) {
        verificationSessions.delete(sessionId);
        verificationCodes.delete(input.code);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verification code expired",
        });
      }

      const user = await fetchRobloxUserProfile(input.robloxUserId);

      session.completedSession = buildSession(user);
      verificationSessions.set(sessionId, session);
      verificationCodes.delete(input.code);

      return { ok: true };
    }),

  checkVerification: publicProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .mutation(({ input }) => {
      const rateLimitResult = ratelimit({
        buckets: checkVerificationBuckets,
        key: input.sessionId,
        limitCount: CHECK_VERIFY_RATE_LIMIT_COUNT,
        limitWindowMs: CHECK_VERIFY_RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimitResult.result) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit hit. Try again in ${Math.ceil(rateLimitResult.retryAfterMs / 1000)}s.`,
        });
      }

      cleanupExpiredVerificationSessions();
      const session = verificationSessions.get(input.sessionId);

      if (!session) {
        return { status: "expired" as const };
      }

      if (!session.completedSession) {
        return {
          status: "pending" as const,
          expiresAt: session.expiresAt,
          code: session.code,
        };
      }

      return {
        status: "verified" as const,
        jwt: session.completedSession.jwt,
        user: session.completedSession.user,
      };
    }),

  refresh: publicProcedure
    .input(z.object({ jwt: z.string() }))
    .mutation(async ({ input }) => {
      let payload: unknown;
      try {
        payload = jwt.verify(input.jwt, env.JWT_SECRET, {
          ignoreExpiration: true,
        });
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid session",
        });
      }

      const parsedPayload = JwtUserIdSchema.safeParse(payload);
      if (!parsedPayload.success) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid session payload",
        });
      }

      const { robloxUserId } = parsedPayload.data;
      const rateLimitResult = ratelimit({
        buckets: refreshBuckets,
        key: robloxUserId,
        limitCount: REFRESH_RATE_LIMIT_COUNT,
        limitWindowMs: REFRESH_RATE_LIMIT_WINDOW_MS,
      });
      if (!rateLimitResult.result) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit hit. Try again in ${Math.ceil(rateLimitResult.retryAfterMs / 1000)}s.`,
        });
      }

      const user = await fetchRobloxUserProfile(robloxUserId);
      return buildSession(user);
    }),
});
