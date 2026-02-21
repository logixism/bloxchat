import { ChatMessage } from "@bloxchat/api";
import { useEffect, useState } from "react";
import { FormattedText } from "./FormattedText";
import { invoke } from "@tauri-apps/api/core";

interface MessageItemProps {
  message: ChatMessage;
  isContinuation?: boolean;
}

export const MessageItem = ({
  message,
  isContinuation = false,
}: MessageItemProps) => {
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    const urls = message.content.match(/https?:\/\/[^\s]+/g) || [];
    urls.forEach(async (url) => {
      try {
        const valid = await invoke("is_image", { url });
        if (valid) {
          setImageUrls((prev) => [...new Set([...prev, url])]);
        }
      } catch (err) {
        console.error("Failed to check image:", url, err);
      }
    });
  }, [message]);

  const isMentioned =
    message.content.includes("@everyone") ||
    message.content.includes(`@${message.author.name}`);

  return (
    <div
      className={`
        group w-full px-4 transition-colors
        ${isMentioned ? "bg-amber-300/10 hover:bg-amber-300/20" : "hover:bg-muted/50"}
        ${isContinuation ? "mt-0" : "mt-2"}
      `}
    >
      <div className="flex items-start gap-3 py-0">
        {!isContinuation ? (
          <img
            src={message.author.picture}
            alt="avatar"
            className="w-10 h-10 rounded-full mt-1 shrink-0"
          />
        ) : (
          <div className="w-10 shrink-0" />
        )}

        <div className="flex flex-col min-w-0">
          {!isContinuation && (
            <span className="font-bold text-sm text-foreground">
              {message.author.name}
            </span>
          )}

          <div className="text-sm leading-relaxed">
            <FormattedText
              content={message.content}
              username={message.author.picture}
              imageUrls={imageUrls}
            />
          </div>

          {imageUrls.map((url) => (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              key={url}
              className="block mt-2"
            >
              <img
                src={url}
                alt="embedded content"
                className="max-w-md max-h-80 rounded-lg border border-border object-cover"
              />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};
