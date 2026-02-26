import { TRPCError } from "@trpc/server";
import z from "zod";
import { JwtUser } from "../types";
import { env } from "../config/env";

const RobloxUserResponseSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string(),
  displayName: z.string(),
});

const RobloxHeadshotResponseSchema = z.object({
  data: z.array(
    z.object({
      targetId: z.number().int().nonnegative(),
      imageUrl: z.string().nullable().optional(),
    }),
  ),
});

const RobloxUserIdSchema = z.string().regex(/^\d+$/, "Invalid user id");

function getRobloxRequestInit(): RequestInit | undefined {
  const cookie = env.ROBLOX_COOKIE?.trim();
  if (!cookie) return undefined;

  const cookieHeader = /(^|;\s*)\.ROBLOSECURITY=/.test(cookie)
    ? cookie
    : `.ROBLOSECURITY=${cookie}`;

  return {
    headers: {
      Cookie: cookieHeader,
    },
  };
}

export async function fetchRobloxUserProfile(userId: string): Promise<JwtUser> {
  const normalizedUserId = RobloxUserIdSchema.parse(userId);
  const userIdAsNumber = Number(normalizedUserId);
  const requestInit = getRobloxRequestInit();

  const [userRes, headshotRes] = await Promise.all([
    fetch(`https://users.roblox.com/v1/users/${normalizedUserId}`, requestInit),
    fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${normalizedUserId}&size=420x420&format=Png&isCircular=false`,
      requestInit,
    ),
  ]);

  if (!userRes.ok) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Failed to fetch Roblox user profile",
    });
  }

  if (!headshotRes.ok) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to fetch Roblox user headshot",
    });
  }

  const robloxUser = RobloxUserResponseSchema.parse(await userRes.json());
  const robloxHeadshot = RobloxHeadshotResponseSchema.parse(
    await headshotRes.json(),
  );

  const imageUrl =
    robloxHeadshot.data.find((item) => item.targetId === userIdAsNumber)
      ?.imageUrl ?? null;

  if (!imageUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Roblox user headshot not available",
    });
  }

  return {
    robloxUserId: String(robloxUser.id),
    username: robloxUser.name,
    displayName: robloxUser.displayName,
    picture: imageUrl,
  };
}
