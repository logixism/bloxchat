import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
} from "react";
import { trpc } from "../lib/trpc";
import { listen } from "@tauri-apps/api/event";
import type { ChatMessage } from "@bloxchat/api";
import { invoke } from "@tauri-apps/api/core";

type ChatContextType = {
  currentJobId: string;
  setCurrentJobId: (id: string) => void;
  messages: ChatMessage[];
  sendMessage: (text: string) => Promise<void>;
};

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const [currentJobId, setCurrentJobId] = useState("global");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const publish = trpc.chat.publish.useMutation();

  useEffect(() => {
    setMessages([]);
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
    if (!text.trim()) return;

    try {
      invoke("focus_roblox");
      await publish.mutateAsync({ channel: currentJobId, content: text });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  return (
    <ChatContext.Provider
      value={{ currentJobId, setCurrentJobId, messages, sendMessage }}
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
