import { on } from "events";
import { z } from "zod";
import { ChatMessage } from "../types";
import { protectedProcedure, t } from "../trpc";
import { globalPubSub } from "../services/pubsub";

export const chatRouter = t.router({
  publish: protectedProcedure
    .input(z.object({ content: z.string(), channel: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const message: ChatMessage = {
        id: crypto.randomUUID(),
        author: ctx.user,
        content: input.content,
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
