import { on } from "events";
import { z } from "zod";
import { ChatMessage } from "../types";
import { protectedProcedure, t } from "../trpc";
import { globalPubSub } from "../services/pubsub";
import { TRPCError } from "@trpc/server";
import { getChatLimitsForChannel } from "../config/chatLimits";

const messageBuckets = new Map<string, number[]>();

export const chatRouter = t.router({
  limits: t.procedure
    .input(z.object({ channel: z.string() }))
    .query(({ input }) => {
      return getChatLimitsForChannel(input.channel);
    }),

  publish: protectedProcedure
    .input(
      z.object({
        content: z.string(),
        channel: z.string(),
        replyToId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const limits = getChatLimitsForChannel(input.channel);
      const content = input.content.trim();

      if (!content) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Message cannot be empty.",
        });
      }

      if (content.length > limits.maxMessageLength) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Message exceeds ${limits.maxMessageLength} characters.`,
        });
      }

      const now = Date.now();
      const cutoff = now - limits.rateLimitWindowMs;
      const bucketKey = ctx.user.robloxUserId;
      const bucket = (messageBuckets.get(bucketKey) ?? []).filter(
        (timestamp) => timestamp > cutoff,
      );

      if (bucket.length >= limits.rateLimitCount) {
        const oldest = bucket[0];
        const retryAfterMs = Math.max(
          0,
          limits.rateLimitWindowMs - (now - oldest),
        );
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit hit. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
        });
      }

      bucket.push(now);
      messageBuckets.set(bucketKey, bucket);

      const message: ChatMessage = {
        id: crypto.randomUUID(),
        author: ctx.user,
        content,
        replyToId: input.replyToId ?? null,
      };

      globalPubSub.emit(input.channel, message);

      return message;
    }),

  subscribe: t.procedure
    .input(z.object({ channel: z.string() }))
    .subscription(async function* ({ input }) {
      const iterable = on(globalPubSub, input.channel);

      for await (const [message] of iterable) {
        yield message as ChatMessage;
      }
    }),
});
