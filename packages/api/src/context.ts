import { IncomingMessage, ServerResponse } from "http";
import { inferAsyncReturnType } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { env } from "./config/env";
import { JwtUser } from "./types";

export async function createContext({
  req,
  res,
}: {
  req: IncomingMessage;
  res: ServerResponse;
}) {
  let user: JwtUser | null = null;

  const authHeader = req.headers["authorization"];
  const token =
    authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : undefined;

  if (token) {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as JwtUser;
      user = payload;
    } catch {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid JWT" });
    }
  }

  return { user };
}

export type Context = inferAsyncReturnType<typeof createContext>;
