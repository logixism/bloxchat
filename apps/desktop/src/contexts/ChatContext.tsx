import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { trpc } from "../lib/trpc";
import type { ChatLimits, ChatMessage } from "@bloxchat/api";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "./AuthContext";
import { getJoinMessage } from "../lib/store";

export type UiChatMessage = ChatMessage & {
  clientId: string;
  clientTimestamp: number;
  localStatus?: "sending" | "failed";
};

const FALLBACK_CHAT_LIMITS: ChatLimits = {
  maxMessageLength: 280,
  rateLimitCount: 4,
  rateLimitWindowMs: 5000,
};

const DEFAULT_JOIN_MESSAGE = "joined the channel";

const parseRetryAfterMs = (message: string) => {
  const matchedSeconds = message.match(/try again in\s+(\d+)s/i);
  if (!matchedSeconds) return 1000;

  const seconds = Number.parseInt(matchedSeconds[1], 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 1000;
  return seconds * 1000;
};

type ChatContextType = {
  currentJobId: string;
  setCurrentJobId: (id: string) => void;
  refreshCurrentJobId: () => Promise<string>;
  messages: UiChatMessage[];
  chatLimits: ChatLimits;
  sendError: string | null;
  sendMessage: (text: string, replyToId?: string | null) => boolean;
  clearMessages: () => void;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentJobId, setCurrentJobId] = useState("global");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const sentTimestampsByScopeRef = useRef<Map<string, number[]>>(new Map());
  const { user } = useAuth();
  const currentUserIdRef = useRef<string | null>(null);
  const latestJobIdRef = useRef<string | null>(null);
  const autoJoinRetryTimeoutsRef = useRef<Map<string, number>>(new Map());
  currentUserIdRef.current = user?.robloxUserId ?? null;

  const publish = trpc.chat.publish.useMutation();
  const limitsQuery = trpc.chat.limits.useQuery({ channel: currentJobId });
  const chatLimits = limitsQuery.data ?? FALLBACK_CHAT_LIMITS;

  const clearAutoJoinRetry = (channel: string) => {
    const timeout = autoJoinRetryTimeoutsRef.current.get(channel);
    if (timeout === undefined) return;
    window.clearTimeout(timeout);
    autoJoinRetryTimeoutsRef.current.delete(channel);
  };

  const queueAutoJoinSend = (channel: string, content: string, delayMs = 0) => {
    clearAutoJoinRetry(channel);

    const timeout = window.setTimeout(async () => {
      try {
        await publish.mutateAsync({ channel, content });
        autoJoinRetryTimeoutsRef.current.delete(channel);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send join message.";

        if (/rate.?limit/i.test(message)) {
          queueAutoJoinSend(channel, content, parseRetryAfterMs(message));
          return;
        }

        autoJoinRetryTimeoutsRef.current.delete(channel);
        console.error("Failed to send auto join message:", err);
      }
    }, delayMs);

    autoJoinRetryTimeoutsRef.current.set(channel, timeout);
  };

  const triggerAutoJoinMessage = async (channel: string) => {
    if (!currentUserIdRef.current) return;

    const configured = (await getJoinMessage()).trim();
    const content = configured || DEFAULT_JOIN_MESSAGE;
    queueAutoJoinSend(channel, content);
  };

  const applyObservedJobId = (nextJobId: string) => {
    const previousJobId = latestJobIdRef.current;
    latestJobIdRef.current = nextJobId;

    setCurrentJobId((prev) => (prev === nextJobId ? prev : nextJobId));

    if (previousJobId === null || previousJobId === nextJobId) {
      return nextJobId;
    }

    void triggerAutoJoinMessage(nextJobId);
  };

  const syncJobId = async () => {
    const nextJobId = await invoke<string>("get_job_id");
    applyObservedJobId(nextJobId);
    return nextJobId;
  };

  useEffect(() => {
    setMessages([]);
    setSendError(null);
  }, [currentJobId]);

  trpc.chat.subscribe.useSubscription(
    { channel: currentJobId },
    {
      onData(message: ChatMessage) {
        const receivedAt = Date.now();
        setMessages((prev) => {
          if (prev.some((existing) => existing.id === message.id)) {
            return prev;
          }

          const currentUserId = currentUserIdRef.current;
          if (!currentUserId || message.author.robloxUserId !== currentUserId) {
            return [
              ...prev,
              {
                ...message,
                clientId: message.id,
                clientTimestamp: receivedAt,
              },
            ];
          }

          const matchIndex = prev.findIndex(
            (item) =>
              item.id.startsWith("local-") &&
              item.localStatus !== "failed" &&
              item.author.robloxUserId === currentUserId &&
              item.content.trim() === message.content.trim() &&
              (item.replyToId ?? null) === (message.replyToId ?? null),
          );

          if (matchIndex === -1) {
            return [
              ...prev,
              {
                ...message,
                clientId: message.id,
                clientTimestamp: receivedAt,
              },
            ];
          }

          const next = [...prev];
          next[matchIndex] = {
            ...message,
            clientId: next[matchIndex].clientId,
            clientTimestamp:
              next[matchIndex].clientTimestamp ?? receivedAt,
          };
          return next;
        });
      },
      onError(err) {
        console.error("Subscription error:", err);
      },
    },
  );

  const refreshCurrentJobId = async () => {
    return syncJobId();
  };

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const nextJobId = await invoke<string>("get_job_id");
        if (cancelled) return;
        applyObservedJobId(nextJobId);
      } catch (err) {
        console.error("Failed to sync job id:", err);
      }
    };

    sync();
    const interval = window.setInterval(sync, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      for (const timeout of autoJoinRetryTimeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      autoJoinRetryTimeoutsRef.current.clear();
    };
  }, []);

  const sendMessage = (text: string, replyToId?: string | null) => {
    const content = text.trim();
    if (!content) return false;

    const author = user;
    if (!author) {
      setSendError("You must be logged in to send messages.");
      return false;
    }

    const normalizedReplyToId =
      replyToId && !replyToId.startsWith("local-") ? replyToId : null;

    if (content.length > chatLimits.maxMessageLength) {
      setSendError(
        `Message exceeds ${chatLimits.maxMessageLength} characters.`,
      );
      return false;
    }

    const now = Date.now();
    const cutoff = now - chatLimits.rateLimitWindowMs;
    const scopeKey = `${author.robloxUserId}`;
    const recentForUser = (
      sentTimestampsByScopeRef.current.get(scopeKey) ?? []
    ).filter((timestamp) => timestamp > cutoff);

    if (recentForUser.length >= chatLimits.rateLimitCount) {
      const retryAt = recentForUser[0] + chatLimits.rateLimitWindowMs;
      const retryAfterMs = Math.max(0, retryAt - now);
      setSendError(
        `Rate limit hit. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      );
      return false;
    }

    const localId = `local-${now.toString(36)}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: UiChatMessage = {
      id: localId,
      clientId: localId,
      clientTimestamp: now,
      author,
      content,
      replyToId: normalizedReplyToId,
      localStatus: "sending",
    };

    recentForUser.push(now);
    sentTimestampsByScopeRef.current.set(scopeKey, recentForUser);
    setSendError(null);
    setMessages((prev) => [...prev, optimisticMessage]);

    void invoke("focus_roblox").catch((err) => {
      console.error("Failed to focus Roblox:", err);
    });

    void (async () => {
      try {
        const activeJobId = await refreshCurrentJobId();
        await publish.mutateAsync({
          channel: activeJobId,
          content,
          replyToId: normalizedReplyToId,
        });

        setMessages((prev) =>
          prev.map((message) =>
            message.clientId === localId
              ? { ...message, localStatus: undefined }
              : message,
          ),
        );
      } catch (err) {
        console.error("Failed to send message:", err);
        setSendError(
          err instanceof Error ? err.message : "Failed to send message.",
        );

        sentTimestampsByScopeRef.current.set(
          scopeKey,
          (sentTimestampsByScopeRef.current.get(scopeKey) ?? []).filter(
            (timestamp) => timestamp !== now,
          ),
        );

        setMessages((prev) =>
          prev.map((message) =>
            message.clientId === localId
              ? { ...message, localStatus: "failed" }
              : message,
          ),
        );
      }
    })();

    return true;
  };

  const clearMessages = () => {
    setMessages([]);
    setSendError(null);
  };

  return (
    <ChatContext.Provider
      value={{
        currentJobId,
        setCurrentJobId,
        refreshCurrentJobId,
        messages,
        chatLimits,
        sendError,
        sendMessage,
        clearMessages,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) throw new Error("useChat must be used within ChatProvider");
  return context;
};
