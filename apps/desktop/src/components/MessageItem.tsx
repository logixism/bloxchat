import type { UiChatMessage } from "../contexts/ChatContext";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FormattedText } from "./FormattedText";
import { getImageLoadingEnabled } from "../lib/store";
import { Button } from "./ui/button";
import { Reply, Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { openUrl } from "@tauri-apps/plugin-opener";

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

const formatTimestamp = (timestamp: number) => timeFormatter.format(timestamp);

type MediaProbeResult = {
  displayable: boolean;
  kind: "image" | "video" | "none";
  finalUrl: string;
};

type DetectedMedia = {
  sourceUrl: string;
  resolvedUrl: string;
  kind: "image" | "video";
};

interface MessageItemProps {
  message: UiChatMessage;
  isContinuation?: boolean;
  onToggleFavoriteMedia?: (url: string) => void;
  isMediaFavorited?: (url: string) => boolean;
  onReply?: (message: UiChatMessage) => void;
  replyPreview?: { author: string; content: string } | null;
  onJumpToReplyTarget?: (replyToId: string) => void;
  isHighlighted?: boolean;
}

interface MessageAuthorProps {
  displayName: string;
  username: string;
  isContinuation: boolean;
}

export const MessageAuthor = ({
  displayName,
  username,
  isContinuation,
}: MessageAuthorProps) => {
  if (isContinuation) return null;

  return (
    <span className="relative inline-grid mt-2 mb-0.5 text-sm font-bold leading-none text-foreground chat-readable-text">
      <span className="transition-opacity duration-150 ease-out group-hover/message-head:opacity-0">
        {displayName}
      </span>
      <span className="hidden group-hover/message-head:block">
        {username}
      </span>
    </span>
  );
};

export const MessageItem = ({
  message,
  isContinuation = false,
  onToggleFavoriteMedia,
  isMediaFavorited,
  onReply,
  replyPreview,
  onJumpToReplyTarget,
  isHighlighted = false,
}: MessageItemProps) => {
  const [mediaUrls, setMediaUrls] = useState<DetectedMedia[]>([]);
  const { user } = useAuth();
  const isSending = message.localStatus === "sending";
  const isFailed = message.localStatus === "failed";
  const canReply = !isSending && !isFailed && !message.id.startsWith("local-");
  
  const timestamp = message.clientTimestamp ?? Date.now();
  const timeLabel = formatTimestamp(timestamp);
  const timeTitle = new Date(timestamp).toLocaleString();

  useEffect(() => {
    let cancelled = false;

    const detectMedia = async () => {
      const enabled = await getImageLoadingEnabled();
      if (!enabled || cancelled) {
        setMediaUrls([]);
        return;
      }

      const urls = message.content.match(/https?:\/\/[^\s]+/g) || [];
      const probes = await Promise.all(
        urls.map(async (url) => {
          try {
            const result = await invoke<MediaProbeResult>("is_image", { url });
            if (!result.displayable || result.kind === "none") return null;

            return {
              sourceUrl: url,
              resolvedUrl: result.finalUrl || url,
              kind: result.kind === "video" ? "video" : "image",
            } satisfies DetectedMedia;
          } catch (err) {
            console.error("Failed to check media URL:", url, err);
            return null;
          }
        }),
      );

      if (cancelled) return;

      const seen = new Set<string>();
      const deduped = probes.filter((media): media is DetectedMedia => {
        if (!media) return false;
        if (seen.has(media.sourceUrl)) return false;
        seen.add(media.sourceUrl);
        return true;
      });

      setMediaUrls(deduped);
    };

    detectMedia().catch((err) => {
      if (!cancelled) {
        console.error("Media detection failed:", err);
        setMediaUrls([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [message.content]);

  const mediaSourceUrls = mediaUrls.map((media) => media.sourceUrl);

  const isMentioned =
    message.content.includes("@everyone") ||
    message.content.includes(`@${user?.username}`) ||
    replyPreview?.author === user?.displayName;

  return (
    <div
      data-message-id={message.id}
      className={`
        group relative w-full px-4 transition-colors
        ${isMentioned ? "bg-amber-300/10 hover:bg-amber-300/20" : "hover:bg-muted/50"}
        ${isContinuation ? "mt-0" : "mt-2"}
        ${isSending ? "opacity-70" : ""}
        ${isHighlighted ? "bg-brand/10" : ""}
      `}
    >
      <div
        className={`flex items-start flex-col pl-12 ${isContinuation ? "" : "group/message-head"}`}
      >
        {onReply && canReply && (
          <button
            type="button"
            className="absolute right-2 -top-2 z-10 rounded-md border border-border bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 cursor-pointer"
            onClick={() => onReply(message)}
            title="Reply"
            aria-label="Reply"
          >
            <Reply className="h-3.5 w-3.5" />
          </button>
{replyPreview && message.replyToId ? (
  onJumpToReplyTarget ? (
    <button
      type="button"
      className="group/reply-preview flex w-full items-center gap-2 text-left text-xs text-muted-foreground hover:text-foreground cursor-pointer"
      onClick={() => onJumpToReplyTarget(message.replyToId!)}
      title="Jump to original message"
      aria-label="Jump to original message"
    >
      <div className="absolute w-6 h-2 rounded-tl-lg border-muted-foreground left-9 top-2 border-t-2 border-l-2 group-hover/reply-preview:border-foreground/85" />
      <span className="w-full truncate">
        <span className="font-semibold text-foreground/80">
          @{replyPreview.author}
        </span>
        <span className="ml-1 text-muted-foreground">
          {replyPreview.content}
        </span>
      </span>
    </button>
  ) : (
    <div className="flex w-full items-center gap-2 text-xs text-muted-foreground">
      <div className="absolute w-6 h-2 rounded-tl-lg border-muted-foreground left-9 top-2 border-t-2 border-l-2" />
      <span className="w-full truncate">
        <span className="font-semibold text-foreground/80">
          @{replyPreview.author}
        </span>
        <span className="ml-1 text-muted-foreground">
          {replyPreview.content}
        </span>
      </span>
    </div>
  )
) : null}

{/* Avatar OR time column */}
{!isContinuation ? (
  <button
    type="button"
    className="absolute pt-1 left-4 shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-2"
    onClick={() =>
      openUrl(
        `https://roblox.com/users/${message.author.robloxUserId}/profile`,
      )
    }
    title="Open profile"
    aria-label={`Open ${message.author.displayName}'s profile`}
  >
    <img
      src={message.author.picture}
      alt={`${message.author.displayName} avatar`}
      className="h-10 w-10 rounded-full cursor-pointer transition duration-150 ease-out group-hover/message-head:ring-2 group-hover/message-head:ring-brand"
    />
    <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-150 ease-out group-hover/message-head:bg-black/35">
      Profile
    </span>
  </button>
) : (
  <div className="w-10 shrink-0 flex items-start justify-center">
    <span
      className="block mt-1.5 text-[10px] leading-none text-muted-foreground text-center opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100"
      title={timeTitle}
    >
      {timeLabel}
    </span>
  </div>
)}

<div className="flex flex-col min-w-0 w-full">
  {!isContinuation && (
    <div className="flex items-baseline gap-2 mb-1">
      <MessageAuthor
        username={message.author.username}
        displayName={message.author.displayName}
        isContinuation={isContinuation}
      />
      <span
        className="text-[10px] text-muted-foreground"
        title={timeTitle}
      >
        {timeLabel}
      </span>
    </div>
  )}

          <div className="wrap-break-word text-sm leading-relaxed text-foreground/95 chat-readable-text">
            <FormattedText
              content={message.content}
              imageUrls={mediaSourceUrls}
              tone={isFailed ? "error" : "default"}
            />
          </div>

          {mediaUrls.map((media) => (
            <div
              key={media.sourceUrl}
              className="mt-2 relative group/media w-fit max-w-full"
            >
              <a
                href={media.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block max-w-full"
              >
                {media.kind === "video" ? (
                  <video
                    src={media.resolvedUrl}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="block max-w-full sm:max-w-md max-h-40 rounded-lg border border-border object-contain bg-muted/20"
                  />
                ) : (
                  <img
                    src={media.resolvedUrl}
                    alt="embedded content"
                    loading="lazy"
                    decoding="async"
                    className="block max-w-full sm:max-w-md max-h-40 rounded-lg border border-border object-contain bg-muted/20"
                  />
                )}
              </a>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                onClick={() => onToggleFavoriteMedia?.(media.sourceUrl)}
                className="absolute top-2 right-2 h-8 w-8 rounded-full opacity-0 group-hover/media:opacity-100 focus-visible:opacity-100 transition-opacity"
                title={
                  isMediaFavorited?.(media.sourceUrl)
                    ? "Unfavorite"
                    : "Favorite"
                }
              >
                <Star
                  className={
                    isMediaFavorited?.(media.sourceUrl)
                      ? "fill-brand text-brand"
                      : "text-foreground"
                  }
                />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
