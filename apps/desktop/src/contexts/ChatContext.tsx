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

export type UiChatMessage = ChatMessage & {
  clientId: string;
  localStatus?: "sending" | "failed";
};

const FALLBACK_CHAT_LIMITS: ChatLimits = {
  maxMessageLength: 280,
  rateLimitCount: 4,
  rateLimitWindowMs: 5000,
};

type ChatContextType = {
  currentJobId: string;
  setCurrentJobId: (id: string) => void;
  refreshCurrentJobId: () => Promise<string>;
  messages: UiChatMessage[];
  chatLimits: ChatLimits;
  sendError: string | null;
  sendMessage: (text: string) => boolean;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentJobId, setCurrentJobId] = useState("global");
  const [messages, setMessages] = useState<UiChatMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const sentTimestampsByScopeRef = useRef<Map<string, number[]>>(new Map());
  const { user } = useAuth();
  const currentUserIdRef = useRef<string | null>(null);
  currentUserIdRef.current = user?.robloxUserId ?? null;

  const publish = trpc.chat.publish.useMutation();
  const limitsQuery = trpc.chat.limits.useQuery({ channel: currentJobId });
  const chatLimits = limitsQuery.data ?? FALLBACK_CHAT_LIMITS;

  useEffect(() => {
    setMessages([]);
    setSendError(null);
  }, [currentJobId]);

  trpc.chat.subscribe.useSubscription(
    { channel: currentJobId },
    {
      onData(message: ChatMessage) {
        setMessages((prev) => {
          if (prev.some((existing) => existing.id === message.id)) {
            return prev;
          }

          const currentUserId = currentUserIdRef.current;
          if (!currentUserId || message.author.robloxUserId !== currentUserId) {
            return [...prev, { ...message, clientId: message.id }];
          }

          const matchIndex = prev.findIndex(
            (item) =>
              item.id.startsWith("local-") &&
              item.localStatus !== "failed" &&
              item.author.robloxUserId === currentUserId &&
              item.content.trim() === message.content.trim(),
          );

          if (matchIndex === -1) {
            return [...prev, { ...message, clientId: message.id }];
          }

          const next = [...prev];
          next[matchIndex] = {
            ...message,
            clientId: next[matchIndex].clientId,
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
    const nextJobId = await invoke<string>("get_job_id");
    setCurrentJobId((prev) => (prev === nextJobId ? prev : nextJobId));
    return nextJobId;
  };

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const nextJobId = await invoke<string>("get_job_id");
        if (!cancelled) {
          setCurrentJobId((prev) => (prev === nextJobId ? prev : nextJobId));
        }
      } catch (err) {
        console.error("Failed to sync job id:", err);
      }
    };

    sync();
    const interval = window.setInterval(sync, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const sendMessage = (text: string) => {
    const content = text.trim();
    if (!content) return false;

    const author = user;
    if (!author) {
      setSendError("You must be logged in to send messages.");
      return false;
    }

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
      author,
      content,
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
        await publish.mutateAsync({ channel: activeJobId, content });

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
