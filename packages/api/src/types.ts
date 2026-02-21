import { inferRouterOutputs } from "@trpc/server";
import { AppRouter } from "./root";

export type ChatMessage = {
  id: string;
  author: JwtUser;
  content: string;
};

export interface JwtUser {
  robloxUserId: string;
  name: string;
  picture: string;
  accessToken: string;
  refreshToken?: string;
}

export type RouterOutputs = inferRouterOutputs<AppRouter>;
