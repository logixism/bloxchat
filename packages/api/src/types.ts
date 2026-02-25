import { inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "./root";

export type ChatMessage = {
  id: string;
  author: JwtUser;
  content: string;
  replyToId?: string | null;
};

export type ChatLimits = {
  maxMessageLength: number;
  rateLimitCount: number;
  rateLimitWindowMs: number;
};

export interface JwtUser {
  robloxUserId: string;
  username: string;
  displayName: string;
  picture: string;
}

export interface ExtendedJwtUser extends JwtUser {
  data: string;
}

export type RouterOutputs = inferRouterOutputs<AppRouter>;
