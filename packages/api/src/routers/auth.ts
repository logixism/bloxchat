import z from "zod";
import { publicProcedure, t } from "../trpc";
import { TRPCError } from "@trpc/server";
import { env } from "../config/env";
import jwt from "jsonwebtoken";

const RobloxTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  token_type: z.string(),
  expires_in: z.number(),
});

const RobloxUserSchema = z.object({
  sub: z.string(),
  name: z.string(),
  picture: z.string(),
});

async function exchangeCodeForToken(code: string) {
  const res = await fetch("https://apis.roblox.com/oauth/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.ROBLOX_CLIENT_ID,
      client_secret: env.ROBLOX_SECRET_KEY,
      grant_type: "authorization_code",
      code,
      redirect_uri: "bloxchat://auth",
    }),
  });

  if (!res.ok)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Failed to exchange code for token",
    });

  return RobloxTokenSchema.parse(await res.json());
}

async function fetchRobloxUser(accessToken: string) {
  const res = await fetch("https://apis.roblox.com/oauth/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok)
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch user info",
    });

  return RobloxUserSchema.parse(await res.json());
}

export const authRouter = t.router({
  login: publicProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ input }) => {
      const tokenData = await exchangeCodeForToken(input.code);
      const userData = await fetchRobloxUser(tokenData.access_token);

      const jwtPayload = {
        robloxUserId: userData.sub,
        name: userData.name,
        picture: userData.picture,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
      };

      const jwtToken = jwt.sign(jwtPayload, env.JWT_SECRET, {
        expiresIn: "1h",
      });

      return {
        jwt: jwtToken,
        user: {
          id: userData.sub,
          name: userData.name,
          picture: userData.picture,
        },
      };
    }),

  verify: publicProcedure
    .input(z.object({ jwt: z.string() }))
    .mutation(async ({ input }) => {
      try {
        const payload = jwt.verify(input.jwt, env.JWT_SECRET) as any;
        return {
          jwt: input.jwt,
          user: {
            id: payload.robloxUserId,
            name: payload.name,
            picture: payload.picture,
          },
        };
      } catch {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid or expired JWT",
        });
      }
    }),

  refresh: publicProcedure
    .input(z.object({ jwt: z.string() }))
    .mutation(async ({ input }) => {
      let payload: any;
      try {
        payload = jwt.verify(input.jwt, env.JWT_SECRET, {
          ignoreExpiration: true,
        });
      } catch {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid JWT" });
      }

      if (!payload.refreshToken)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "No refresh token available",
        });

      const res = await fetch("https://apis.roblox.com/oauth/v1/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.ROBLOX_CLIENT_ID,
          client_secret: env.ROBLOX_SECRET_KEY,
          grant_type: "refresh_token",
          refresh_token: payload.refreshToken,
        }),
      });

      if (!res.ok)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Failed to refresh token",
        });

      const tokenData = RobloxTokenSchema.parse(await res.json());

      const newJwtPayload = {
        robloxUserId: payload.robloxUserId,
        name: payload.name,
        picture: payload.picture,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? payload.refreshToken,
      };

      const newJwt = jwt.sign(newJwtPayload, env.JWT_SECRET, {
        expiresIn: "28d",
      });

      return {
        jwt: newJwt,
        user: {
          id: payload.robloxUserId,
          name: payload.name,
          picture: payload.picture,
        },
      };
    }),
});
