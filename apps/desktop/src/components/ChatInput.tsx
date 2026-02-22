import { useState, useRef, useEffect, forwardRef, useMemo } from "react";
import type { ChatMessage } from "@bloxchat/api";
import { useChat } from "../contexts/ChatContext";
import {
  findEmojiSuggestions,
  type EmojiSuggestion,
  replaceEmojiShortcodes,
} from "../lib/emoji";

interface ChatInputProps {
  value: string;
  onChange: (val: string) => void;
  messages: ChatMessage[];
  maxLength: number;
}

type Suggestion =
  | { type: "mention"; value: string }
  | { type: "emoji"; value: EmojiSuggestion };

export const ChatInput = forwardRef<HTMLInputElement, ChatInputProps>(
  ({ value, onChange, messages, maxLength }, ref) => {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);

    const internalRef = useRef<HTMLInputElement>(null);
    const { currentJobId } = useChat();

    const usernames = useMemo(
      () => Array.from(new Set(messages.map((m) => m.author.username))),
      [messages],
    );

    useEffect(() => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(internalRef.current);
      } else {
        ref.current = internalRef.current;
      }
    }, [ref]);

    const trimmedLength = value.trim().length;
    const remainingChars = maxLength - trimmedLength;
    const isOverLimit = remainingChars < 0;

    // Suggestion logic
    useEffect(() => {
      const lastWord = value.split(/\s/).pop() || "";

      let nextSuggestions: Suggestion[] = [];
      let shouldShow = false;

      if (lastWord.startsWith("@")) {
        const query = lastWord.slice(1).toLowerCase();
        const matches = usernames.filter((u) =>
          u.toLowerCase().startsWith(query),
        );

        nextSuggestions = matches.map((m) => ({
          type: "mention",
          value: m,
        }));
        shouldShow = matches.length > 0;
      } else if (lastWord.startsWith(":")) {
        const query = lastWord.slice(1).toLowerCase();
        const matches = findEmojiSuggestions(query);

        nextSuggestions = matches.map((m) => ({
          type: "emoji",
          value: m,
        }));
        shouldShow = matches.length > 0;
      }

      setSuggestions(nextSuggestions);
      setShowSuggestions(shouldShow);
      setActiveIndex(0);
    }, [value, usernames]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!showSuggestions || suggestions.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev === 0 ? suggestions.length - 1 : prev - 1,
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        insertSuggestion(suggestions[activeIndex]);
      }
    };

    const insertSuggestion = (suggestion: Suggestion) => {
      const words = value.split(/\s/);

      if (suggestion.type === "mention") {
        words[words.length - 1] = `@${suggestion.value}`;
      } else {
        words[words.length - 1] = suggestion.value.emoji;
      }

      onChange(words.join(" ") + " ");
      setShowSuggestions(false);
      internalRef.current?.focus();
    };

    return (
      <div className="relative w-full">
        <input
          ref={internalRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Chatting ${
            currentJobId === "global"
              ? "globally. If you're in a server, try rejoining."
              : `job id ${currentJobId}`
          }`}
          className="h-10 w-full outline-none text-primary text-sm px-2"
        />

        <div
          className={`absolute right-2 -top-5 text-[10px] ${
            isOverLimit ? "text-red-400" : "text-muted-foreground"
          }`}
        >
          {remainingChars} chars
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute bottom-10 left-0 w-full bg-background max-h-40 overflow-y-auto z-10">
            {suggestions.map((suggestion, idx) => (
              <li
                key={
                  suggestion.type === "mention"
                    ? `mention-${suggestion.value}`
                    : `emoji-${suggestion.value.shortcode}`
                }
                className={`px-2 py-1 cursor-pointer ${
                  idx === activeIndex ? "bg-muted/50" : ""
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertSuggestion(suggestion);
                }}
              >
                {suggestion.type === "mention" ? (
                  suggestion.value
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="inline-block text-base leading-none">
                      {replaceEmojiShortcodes(suggestion.value.emoji)}
                    </span>
                    <span className="text-muted-foreground">
                      :{suggestion.value.shortcode}:
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

ChatInput.displayName = "ChatInput";
