import type { UiChatMessage } from "../contexts/ChatContext";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FormattedText } from "./FormattedText";
import { getImageLoadingEnabled } from "../lib/store";
import { Button } from "./ui/button";
import { Star } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { openUrl } from "@tauri-apps/plugin-opener";

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
    <span className="relative inline-grid text-sm font-bold leading-none mb-1">
      <span className="transition-opacity duration-150 ease-out group-hover/message-head:opacity-0">
        {displayName}
      </span>
      <span className="absolute inset-0 opacity-0 transition-opacity duration-150 ease-out group-hover/message-head:opacity-100">
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
}: MessageItemProps) => {
  const [mediaUrls, setMediaUrls] = useState<DetectedMedia[]>([]);
  const { user } = useAuth();
  const isSending = message.localStatus === "sending";
  const isFailed = message.localStatus === "failed";

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
    message.content.includes(`@${user?.username}`);

  return (
    <div
      className={`
        group w-full px-4 transition-colors
        ${isMentioned ? "bg-amber-300/10 hover:bg-amber-300/20" : "hover:bg-muted/50"}
        ${isContinuation ? "mt-0" : "mt-2"}
        ${isSending ? "opacity-70" : ""}
      `}
    >
      <div
        className={`flex items-start gap-3 py-0 ${isContinuation ? "" : "group/message-head"}`}
      >
        {!isContinuation ? (
          <button
            type="button"
            className="relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand focus-visible:ring-offset-2"
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
              className="h-10 w-10 rounded-full cursor-pointer transition duration-150 ease-out group-hover/message-head:ring-2 group-hover/message-head:ring-brand/40"
            />
            <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-full bg-black/0 text-[10px] font-semibold text-white opacity-0 transition-opacity duration-150 ease-out group-hover/message-head:bg-black/35 group-hover/message-head:opacity-100">
              Profile
            </span>
          </button>
        ) : (
          <div className="w-10 shrink-0" />
        )}

        <div className="flex flex-col min-w-0">
          <MessageAuthor
            username={message.author.username}
            displayName={message.author.displayName}
            isContinuation={isContinuation}
          />

          <div className="text-sm leading-relaxed wrap-break-word">
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
