import { useState, useRef, useEffect, forwardRef } from "react";
import type { ChatMessage } from "@bloxchat/api";
import { useChat } from "../contexts/ChatContext";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  messages: ChatMessage[];
}

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(
  ({ value, onChange, messages }, ref) => {
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const internalRef = useRef<HTMLInputElement>(null);
    const { currentJobId } = useChat();

    useEffect(() => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(internalRef.current);
      } else {
        (ref as React.MutableRefObject<HTMLInputElement | null>).current =
          internalRef.current;
      }
    }, [ref]);

    const usernames = Array.from(new Set(messages.map((m) => m.author.name)));

    useEffect(() => {
      const lastWord = value.split(/\s/).pop() || "";
      if (lastWord.startsWith("@")) {
        const query = lastWord.slice(1).toLowerCase();
        const matches = usernames.filter((u) =>
          u.toLowerCase().startsWith(query),
        );
        setSuggestions(matches);
        setShowSuggestions(matches.length > 0);
        setActiveIndex(0);
      } else {
        setShowSuggestions(false);
      }
    }, [value, usernames]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev === 0 ? suggestions.length - 1 : prev - 1,
        );
      } else if (e.key === "Enter") {
        if (showSuggestions) {
          e.preventDefault();
          insertSuggestion(suggestions[activeIndex]);
        }
      }
    };

    const insertSuggestion = (username: string) => {
      const words = value.split(/\s/);
      words[words.length - 1] = `@${username}`;
      onChange(words.join(" ") + " ");
      setShowSuggestions(false);
      internalRef.current?.focus();
    };

    return (
      <div className="relative w-full">
        <input
          ref={internalRef} // use internal ref
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Chatting ${currentJobId === "global" ? "globally. If you're in a server, try rejoining." : `job id ${currentJobId}`}`}
          className="h-10 bg-background border-t border-muted w-full outline-none text-primary text-sm px-2 rounded-b-md"
        />
        {showSuggestions && (
          <ul className="absolute bottom-10 left-0 w-full bg-background max-h-40 overflow-y-auto z-10">
            {suggestions.map((u, idx) => (
              <li
                key={u}
                className={`px-2 py-1 cursor-pointer ${
                  idx === activeIndex ? "bg-muted/50" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSuggestion(u);
                }}
              >
                {u}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
