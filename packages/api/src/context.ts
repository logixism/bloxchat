import { IncomingMessage, ServerResponse } from "http";
import { inferAsyncReturnType } from "@trpc/server";
import jwt from "jsonwebtoken";
import { env } from "./config/env";
import { JwtUser } from "./types";

export async function createContext({
  req,
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
    } catch {}
  }

  return { user, headers: req.headers };
}

export type Context = inferAsyncReturnType<typeof createContext>;
