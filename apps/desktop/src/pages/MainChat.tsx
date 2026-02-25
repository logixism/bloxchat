import { useChat } from "../contexts/ChatContext";
import { useState, useRef, useEffect, useMemo } from "react";
import { ChatInput } from "../components/ChatInput";
import { MessageItem } from "../components/MessageItem";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";
import {
  addFavoritedMedia,
  getFavoritedMedia,
  removeFavoritedMedia,
} from "../lib/store";
import { Button } from "../components/ui/button";
import { Star, X } from "lucide-react";
import { replaceEmojiShortcodes } from "../lib/emoji";
import { executeChatCommand } from "../lib/commands";

type MediaProbeResult = {
  displayable: boolean;
  kind: "image" | "video" | "none";
  finalUrl: string;
};

type FavoriteMediaPreview = {
  sourceUrl: string;
  resolvedUrl: string;
  kind: "image" | "video" | "none";
};

export const MainChat = () => {
  const { messages, sendMessage, sendError, chatLimits, clearMessages } =
    useChat();
  const [text, setText] = useState("");
  const [favoritedMedia, setFavoritedMedia] = useState<string[]>([]);
  const [favoriteMediaPreviews, setFavoriteMediaPreviews] = useState<
    FavoriteMediaPreview[]
  >([]);
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false);
  const [replyTargetClientId, setReplyTargetClientId] = useState<string | null>(
    null,
  );
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const appWindowRef = useRef<Window | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const highlightTimeoutRef = useRef<number | null>(null);

  const messageById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages],
  );
  const replyTarget = useMemo(() => {
    if (!replyTargetClientId) return null;
    return (
      messages.find((message) => message.clientId === replyTargetClientId) ??
      null
    );
  }, [messages, replyTargetClientId]);

  useEffect(() => {
    if (replyTargetClientId && !replyTarget) {
      setReplyTargetClientId(null);
    }
  }, [replyTargetClientId, replyTarget]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current !== null) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  const isNearBottom = () => {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom("smooth");
    }
  }, [messages]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const update = () => {
      shouldAutoScrollRef.current = isNearBottom();
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      el.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    const el = scrollContentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (shouldAutoScrollRef.current) {
        scrollToBottom("auto");
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (shouldAutoScrollRef.current) {
        scrollToBottom("auto");
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    (async () => {
      appWindowRef.current = await Window.getByLabel("main");
    })();
  }, []);

  useEffect(() => {
    getFavoritedMedia()
      .then((items) => setFavoritedMedia(items))
      .catch((err) => console.error("Failed to load favorited media:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFavoriteMediaPreviews = async () => {
      const previews = await Promise.all(
        favoritedMedia.map(async (url) => {
          try {
            const result = await invoke<MediaProbeResult>("is_image", { url });
            if (!result.displayable || result.kind === "none") {
              return {
                sourceUrl: url,
                resolvedUrl: url,
                kind: "none",
              } satisfies FavoriteMediaPreview;
            }

            return {
              sourceUrl: url,
              resolvedUrl: result.finalUrl || url,
              kind: result.kind === "video" ? "video" : "image",
            } satisfies FavoriteMediaPreview;
          } catch (err) {
            console.error("Failed to load favorite media preview:", url, err);
            return {
              sourceUrl: url,
              resolvedUrl: url,
              kind: "none",
            } satisfies FavoriteMediaPreview;
          }
        }),
      );

      if (!cancelled) {
        setFavoriteMediaPreviews(previews);
      }
    };

    if (favoritedMedia.length === 0) {
      setFavoriteMediaPreviews([]);
      return;
    }

    loadFavoriteMediaPreviews();

    return () => {
      cancelled = true;
    };
  }, [favoritedMedia]);

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

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      invoke("focus_roblox").catch((err) => console.error(err)); // we directly invoke here
      return;
    }

    const didExecuteCommand = executeChatCommand(trimmed, {
      clearMessages: () => {
        clearMessages();
        shouldAutoScrollRef.current = true;
        setReplyTargetClientId(null);
      },
    });
    if (didExecuteCommand) {
      setText("");
      invoke("focus_roblox").catch((err) => console.error(err));
      return;
    }

    const didQueue = sendMessage(
      replaceEmojiShortcodes(text),
      replyTarget?.id ?? null,
    );
    if (!didQueue) return;
    shouldAutoScrollRef.current = true;
    setText("");
    setReplyTargetClientId(null);
  };

  const isMediaFavorited = (url: string) => favoritedMedia.includes(url);

  const handleToggleFavoriteMedia = async (url: string) => {
    try {
      const next = isMediaFavorited(url)
        ? await removeFavoritedMedia(url)
        : await addFavoritedMedia(url);
      setFavoritedMedia(next);
    } catch (err) {
      console.error("Failed to update favorite media:", err);
    }
  };

  const handleInsertFavoritedMedia = (url: string) => {
    const normalized = url.trim();
    if (!normalized) return;

    setText((prev) => {
      if (!prev.trim()) return normalized;
      return `${prev.trimEnd()} ${normalized}`;
    });
    setShowFavoritesPanel(false);
    inputRef.current?.focus();
  };

  const truncateReplySnippet = (content: string, maxLength = 100) => {
    const normalized = content.replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
  };

  const handleReply = (clientId: string) => {
    setReplyTargetClientId(clientId);
    inputRef.current?.focus();
  };

  const jumpToMessage = (messageId: string) => {
    const escapedId =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? CSS.escape(messageId)
        : messageId.replace(/"/g, '\\"');
    const element = document.querySelector(`[data-message-id="${escapedId}"]`);
    if (!element) return;
    shouldAutoScrollRef.current = false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageId(messageId);
    if (highlightTimeoutRef.current !== null) {
      window.clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = window.setTimeout(() => {
      setHighlightedMessageId((current) =>
        current === messageId ? null : current,
      );
    }, 1500);
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div ref={scrollContentRef} className="flex flex-col pt-2 pb-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground text-xs pt-2">
              No messages yet. Say hi!
            </div>
          )}
          {messages.map((msg, index) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const isContinuation = !!(
              prev &&
              prev.author.robloxUserId === msg.author.robloxUserId &&
              !msg.replyToId
            );
            const replyTargetMessage = msg.replyToId
              ? messageById.get(msg.replyToId)
              : null;
            const replyPreview = replyTargetMessage
              ? {
                  author: replyTargetMessage.author.displayName,
                  content: truncateReplySnippet(replyTargetMessage.content),
                }
              : null;

            return (
              <MessageItem
                key={msg.clientId}
                message={msg}
                isContinuation={isContinuation}
                onToggleFavoriteMedia={handleToggleFavoriteMedia}
                isMediaFavorited={isMediaFavorited}
                onReply={(message) => handleReply(message.clientId)}
                replyPreview={replyPreview}
                onJumpToReplyTarget={jumpToMessage}
                isHighlighted={highlightedMessageId === msg.id}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative">
        {replyTarget && (
          <div className="flex items-center justify-between gap-3 border-t border-muted bg-muted/20 px-3 py-2 text-xs">
            <div className="min-w-0">
              <div className="font-semibold text-foreground">
                Replying to {replyTarget.author.displayName}
              </div>
              <div className="truncate text-muted-foreground">
                {truncateReplySnippet(replyTarget.content)}
              </div>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setReplyTargetClientId(null)}
              title="Cancel reply"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {showFavoritesPanel && (
          <div className="absolute bottom-12 right-2 z-20 w-72 max-h-72 overflow-y-auto rounded-md border border-border bg-background p-2 shadow-lg">
            {favoriteMediaPreviews.length === 0 ? (
              <div className="text-xs text-muted-foreground px-1 py-2">
                No favorited media yet.
              </div>
            ) : (
              <div className="space-y-2">
                {favoriteMediaPreviews.map((media) => (
                  <div
                    key={media.sourceUrl}
                    className="w-full rounded-md border border-border overflow-hidden bg-background"
                    title={media.sourceUrl}
                  >
                    <button
                      type="button"
                      className="w-full text-left hover:bg-muted/50"
                      onClick={() =>
                        handleInsertFavoritedMedia(media.sourceUrl)
                      }
                    >
                      {media.kind === "video" ? (
                        <video
                          src={media.resolvedUrl}
                          muted
                          playsInline
                          loop
                          autoPlay
                          className="w-full h-24 object-cover bg-muted/20"
                        />
                      ) : media.kind === "image" ? (
                        <img
                          src={media.resolvedUrl}
                          alt="favorited media"
                          className="w-full h-24 object-cover bg-muted/20"
                        />
                      ) : (
                        <div className="w-full h-24 bg-muted/20 flex items-center justify-center text-xs text-muted-foreground px-2">
                          No preview
                        </div>
                      )}
                    </button>
                    <div className="px-2 py-1 flex items-center gap-2">
                      <div className="text-[11px] truncate text-muted-foreground flex-1">
                        {media.sourceUrl}
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() =>
                          handleToggleFavoriteMedia(media.sourceUrl)
                        }
                        title="Unfavorite media"
                      >
                        <Star className="fill-brand text-brand" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <form
          className="flex items-center bg-background border-t border-muted"
          onSubmit={handleSubmit}
        >
          <div className="flex-1">
            <ChatInput
              ref={inputRef}
              value={replaceEmojiShortcodes(text)}
              onChange={(value) => setText(replaceEmojiShortcodes(value))}
              messages={messages}
              maxLength={chatLimits.maxMessageLength}
            />
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="mr-0.5"
            onClick={() => setShowFavoritesPanel((prev) => !prev)}
            title="Favorited media"
          >
            <Star className={"fill-brand text-brand"} />
          </Button>
        </form>
      </div>
      {sendError && (
        <div className="px-2 py-1 text-[11px] text-red-400 border-t border-muted">
          {sendError}
        </div>
      )}
    </div>
  );
};
