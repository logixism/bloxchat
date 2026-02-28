import { useEffect, useMemo, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useLocation } from "react-router-dom";
import { setActivity, start, stop } from "tauri-plugin-drpc";
import {
  Activity,
  ActivityType,
  Button,
  Timestamps,
} from "tauri-plugin-drpc/activity";
import { useAuth } from "../contexts/AuthContext";
import { useChat } from "../contexts/ChatContext";
import {
  DISCORD_RPC_APP_ID_CHANGED_EVENT,
  DISCORD_RPC_DISABLED_APP_ID,
  getDiscordRpcAppId,
} from "../lib/store";
import { formatChannelLabel } from "../lib/utils";

type PresenceDescriptor = {
  details: string;
  state: string;
  contextKey: string;
};

const truncateForDiscord = (value: string, maxLength = 128) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
};

const buildPresenceDescriptor = (params: {
  pathname: string;
  loading: boolean;
  hasVerificationCode: boolean;
  user: {
    robloxUserId: string;
    username: string;
    displayName: string;
  } | null;
  currentJobId: string;
  messageCount: number;
}): PresenceDescriptor => {
  const { pathname, loading, user, currentJobId, messageCount } = params;

  if (loading) {
    return {
      details: "Starting BloxChat",
      state: "Loading session",
      contextKey: "loading",
    };
  }

  if (!user) {
    return {
      details: "Verifying Roblox account",
      state: "Waiting for verification",
      contextKey: "auth:pending",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      details: "Configuring BloxChat",
      state: `Changing some settings...`,
      contextKey: `settings:${user.robloxUserId}`,
    };
  }

  const messageLabel = `${messageCount} message${messageCount === 1 ? "" : "s"}`;
  return {
    details: `Chatting as ${user.username}`,
    state: `${formatChannelLabel(currentJobId)} | ${messageLabel}`,
    contextKey: `chat:${user.robloxUserId}:${currentJobId}`,
  };
};

export const useDiscordRpc = () => {
  const { user, loading, verificationCode } = useAuth();
  const { currentJobId, messages } = useChat();
  const { pathname } = useLocation();
  const [discordAppId, setDiscordAppId] = useState(DISCORD_RPC_DISABLED_APP_ID);
  const [rpcReady, setRpcReady] = useState(false);
  const lastSerializedActivityRef = useRef("");
  const sessionRef = useRef<{ key: string; startedAt: number } | null>(null);

  const canUseRpc = isTauri() && discordAppId !== DISCORD_RPC_DISABLED_APP_ID;

  const descriptor = useMemo(
    () =>
      buildPresenceDescriptor({
        pathname,
        loading,
        hasVerificationCode: Boolean(verificationCode),
        user,
        currentJobId,
        messageCount: messages.length,
      }),
    [pathname, loading, verificationCode, user, currentJobId, messages.length],
  );

  useEffect(() => {
    if (!isTauri()) return;

    let disposed = false;

    void getDiscordRpcAppId()
      .then((appId) => {
        if (!disposed) {
          setDiscordAppId(appId);
        }
      })
      .catch((error) => {
        console.error("Failed to load Discord RPC App ID:", error);
      });

    const onAppIdChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setDiscordAppId(customEvent.detail ?? DISCORD_RPC_DISABLED_APP_ID);
    };

    window.addEventListener(DISCORD_RPC_APP_ID_CHANGED_EVENT, onAppIdChange);

    return () => {
      disposed = true;
      window.removeEventListener(
        DISCORD_RPC_APP_ID_CHANGED_EVENT,
        onAppIdChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!canUseRpc) return;

    let cancelled = false;

    void (async () => {
      try {
        await start(discordAppId);
        if (cancelled) {
          return;
        }
        setRpcReady(true);
      } catch (error) {
        console.error("Failed to initialize Discord RPC:", error);
      }
    })();

    return () => {
      cancelled = true;
      setRpcReady(false);
      sessionRef.current = null;
      lastSerializedActivityRef.current = "";
      void stop().catch((error) => {
        console.error("Failed to stop Discord RPC:", error);
      });
    };
  }, [canUseRpc, discordAppId]);

  useEffect(() => {
    if (!canUseRpc || !rpcReady) return;

    const previousSession = sessionRef.current;
    if (!previousSession || previousSession.key !== descriptor.contextKey) {
      sessionRef.current = {
        key: descriptor.contextKey,
        startedAt: Date.now(),
      };
    }
    const activityStartTime = sessionRef.current?.startedAt ?? Date.now();

    const activity = new Activity()
      .setActivity(ActivityType.Playing)
      .setDetails(truncateForDiscord(descriptor.details))
      .setState(truncateForDiscord(descriptor.state))
      .setTimestamps(new Timestamps(activityStartTime))
      .setButton([
        new Button("Get BloxChat", "https://github.com/logixism/bloxchat"),
      ]);

    const serializedActivity = activity.toString();
    if (serializedActivity === lastSerializedActivityRef.current) return;
    lastSerializedActivityRef.current = serializedActivity;

    void setActivity(activity).catch((error) => {
      console.error("Failed to update Discord RPC activity:", error);
    });
  }, [canUseRpc, rpcReady, descriptor]);
};
