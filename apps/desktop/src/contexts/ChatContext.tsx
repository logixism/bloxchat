import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { trpc } from "../lib/trpc";
import { listen } from "@tauri-apps/api/event";
import type { ChatLimits, ChatMessage } from "@bloxchat/api";
import { invoke } from "@tauri-apps/api/core";

const FALLBACK_CHAT_LIMITS: ChatLimits = {
  maxMessageLength: 280,
  rateLimitCount: 4,
  rateLimitWindowMs: 5000,
};

type ChatContextType = {
  currentJobId: string;
  setCurrentJobId: (id: string) => void;
  messages: ChatMessage[];
  chatLimits: ChatLimits;
  sendError: string | null;
  sendMessage: (text: string) => Promise<boolean>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentJobId, setCurrentJobId] = useState("global");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const sentTimestampsByChannelRef = useRef<Map<string, number[]>>(new Map());

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
        setMessages((prev) => [...prev, message]);
      },
      onError(err) {
        console.error("Subscription error:", err);
      },
    },
  );

  useEffect(() => {
    const unlistenPromise = listen<string>("new-job-id", (event) => {
      setCurrentJobId(event.payload);
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const sendMessage = async (text: string) => {
    const content = text.trim();
    if (!content) return false;

    if (content.length > chatLimits.maxMessageLength) {
      setSendError(
        `Message exceeds ${chatLimits.maxMessageLength} characters.`,
      );
      return false;
    }

    const now = Date.now();
    const cutoff = now - chatLimits.rateLimitWindowMs;
    const recentForChannel = (
      sentTimestampsByChannelRef.current.get(currentJobId) ?? []
    ).filter((timestamp) => timestamp > cutoff);

    if (recentForChannel.length >= chatLimits.rateLimitCount) {
      const retryAt = recentForChannel[0] + chatLimits.rateLimitWindowMs;
      const retryAfterMs = Math.max(0, retryAt - now);
      setSendError(
        `Rate limit hit. Try again in ${Math.ceil(retryAfterMs / 1000)}s.`,
      );
      return false;
    }

    try {
      await invoke("focus_roblox");
      await publish.mutateAsync({ channel: currentJobId, content });

      recentForChannel.push(now);
      sentTimestampsByChannelRef.current.set(currentJobId, recentForChannel);
      setSendError(null);
      return true;
    } catch (err) {
      console.error("Failed to send message:", err);
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
      return false;
    }
  };

  return (
    <ChatContext.Provider
      value={{
        currentJobId,
        setCurrentJobId,
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
