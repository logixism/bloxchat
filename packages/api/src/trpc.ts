import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";
import crypto from "crypto";
import { env } from "./config/env";

export const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;

export const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });

  return next({
    ctx: {
      ...ctx,
      user: ctx.user!,
    },
  });
});

const hasVerificationSecret = middleware(async ({ ctx, next }) => {
  const secretHeader = ctx.headers["x-verification-secret"];
  const providedSecret = Array.isArray(secretHeader)
    ? secretHeader[0]
    : secretHeader;

  if (!providedSecret || !isValidVerificationSecret(providedSecret)) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid verification secret",
    });
  }

  return next();
});

function isValidVerificationSecret(providedSecret: string) {
  const expectedSecret = env.VERIFICATION_SECRET;
  if (providedSecret.length !== expectedSecret.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(providedSecret),
    Buffer.from(expectedSecret),
  );
}

export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const gameVerificationProcedure = t.procedure.use(hasVerificationSecret);
