import { useChat } from "../contexts/ChatContext";
import { useState, useRef, useEffect } from "react";
import { ChatInput } from "../components/ChatInput";
import { MessageItem } from "../components/MessageItem";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";

export const MainChat = () => {
  const { messages, sendMessage } = useChat();
  const [text, setText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appWindowRef = useRef<Window | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    (async () => {
      appWindowRef.current = await Window.getByLabel("main");
    })();
  }, []);

  // since we can't listen for global key events for a top-most window, we will listen to browser events
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        invoke("focus_roblox").catch((err) => console.error(err));
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<string>("key-pressed", async (event) => {
      console.log(event);

      if (event.payload === "Slash") {
        await invoke("should_steal_focus").then(async (shouldStealFocus) => {
          if (shouldStealFocus) {
            await appWindowRef.current?.setFocus();
            inputRef.current?.focus();
          }
        });
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!text.trim()) return;
    sendMessage(text);
    setText("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto flex flex-col py-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-xs">
            No messages yet. Say hi!
          </div>
        )}
        {messages.map((msg, index) => {
          const prev = index > 0 ? messages[index - 1] : null;
          const isContinuation = !!(
            prev && prev.author.robloxUserId === msg.author.robloxUserId
          );

          return (
            <MessageItem
              key={msg.id}
              message={msg}
              isContinuation={isContinuation}
            />
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form
        className="flex items-center bg-background rounded-lg"
        onSubmit={handleSubmit}
      >
        <ChatInput
          ref={inputRef}
          value={text}
          onChange={setText}
          messages={messages}
        />
      </form>
    </div>
  );
};
