import { authRouter } from "./routers/auth";
import { chatRouter } from "./routers/chat";
import { t } from "./trpc";

export const appRouter = t.router({
  chat: chatRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
