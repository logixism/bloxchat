import { useChat } from "../contexts/ChatContext";
import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import {
  ChatInput,
  type ChatInputHandle,
  type GlobalKeyPayload,
} from "../components/ChatInput";
import { MessageItem } from "../components/MessageItem";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Window } from "@tauri-apps/api/window";
import {
  addFavoritedMedia,
  getChatInputMode,
  getChatKeyPersistenceMode,
  getFavoritedMedia,
  removeFavoritedMedia,
  type ChatInputMode,
  type ChatKeyPersistenceMode,
} from "../lib/store";
import { Button } from "../components/ui/button";
import { Star } from "lucide-react";
import { replaceEmojiShortcodes } from "../lib/emoji";

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

type CaptureOpenSource = "slash" | "click";

export const MainChat = () => {
  const { messages, sendMessage, sendError, chatLimits } = useChat();
  const [text, setText] = useState("");
  const [favoritedMedia, setFavoritedMedia] = useState<string[]>([]);
  const [favoriteMediaPreviews, setFavoriteMediaPreviews] = useState<
    FavoriteMediaPreview[]
  >([]);
  const [showFavoritesPanel, setShowFavoritesPanel] = useState(false);
  const [chatCaptureActive, setChatCaptureActive] = useState(false);
  const [chatKeyPersistenceMode, setChatKeyPersistenceMode] =
    useState<ChatKeyPersistenceMode>("full");
  const [chatInputMode, setChatInputMode] = useState<ChatInputMode>("focusless");
  const [activeCaptureInputMode, setActiveCaptureInputMode] =
    useState<ChatInputMode>("focusless");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<ChatInputHandle>(null);
  const appWindowRef = useRef<Window | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const captureTransitionRef = useRef(false);
  const endingCaptureRef = useRef(false);
  const chatCaptureActiveRef = useRef(false);
  const chatKeyPersistenceModeRef = useRef<ChatKeyPersistenceMode>("full");
  const chatInputModeRef = useRef<ChatInputMode>("focusless");
  const activeCaptureInputModeRef = useRef<ChatInputMode>("focusless");
  const textRef = useRef("");

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    chatCaptureActiveRef.current = chatCaptureActive;
  }, [chatCaptureActive]);

  useEffect(() => {
    chatKeyPersistenceModeRef.current = chatKeyPersistenceMode;
  }, [chatKeyPersistenceMode]);

  useEffect(() => {
    chatInputModeRef.current = chatInputMode;
  }, [chatInputMode]);

  useEffect(() => {
    activeCaptureInputModeRef.current = activeCaptureInputMode;
  }, [activeCaptureInputMode]);

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
    (async () => {
      appWindowRef.current = await Window.getByLabel("main");
    })();
  }, []);

  useEffect(() => {
    Promise.all([getChatKeyPersistenceMode(), getChatInputMode()])
      .then(([mode, inputMode]) => {
        setChatKeyPersistenceMode(mode);
        setChatInputMode(inputMode);
      })
      .catch((err) => console.error("Failed to load chat capture settings:", err));
  }, []);

  useEffect(() => {
    return () => {
      if (!chatCaptureActiveRef.current) return;
      void invoke("stop_chat_capture", { reason: "cancel", _reason: "cancel" }).catch((err) =>
        console.error("Failed to stop chat capture during cleanup:", err),
      );
      chatCaptureActiveRef.current = false;
    };
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

  const stopChatCaptureSession = useCallback(async (reason: "submit" | "cancel") => {
    if (endingCaptureRef.current) return;
    endingCaptureRef.current = true;

    try {
      await invoke("stop_chat_capture", { reason });
    } catch (err) {
      console.error("Failed to stop chat capture:", err);
    } finally {
      chatCaptureActiveRef.current = false;
      setChatCaptureActive(false);
      endingCaptureRef.current = false;
      if (activeCaptureInputModeRef.current === "ime") {
        void invoke("focus_roblox").catch((err) =>
          console.error("Failed to focus Roblox:", err),
        );
      }
      activeCaptureInputModeRef.current = chatInputModeRef.current;
      setActiveCaptureInputMode(chatInputModeRef.current);
    }
  }, []);

  const handleCaptureSubmit = useCallback(async () => {
    const outgoing = textRef.current;
    setText("");
    await stopChatCaptureSession("submit");

    if (!outgoing.trim()) return;
    const didQueue = sendMessage(replaceEmojiShortcodes(outgoing));
    if (didQueue) {
      shouldAutoScrollRef.current = true;
    }
  }, [sendMessage, stopChatCaptureSession]);

  const handleCaptureCancel = useCallback(async () => {
    setText("");
    await stopChatCaptureSession("cancel");
  }, [stopChatCaptureSession]);

  const switchActiveCaptureInputMode = useCallback(async (nextMode: ChatInputMode) => {
    if (
      captureTransitionRef.current ||
      endingCaptureRef.current ||
      !chatCaptureActiveRef.current
    ) {
      return;
    }

    if (activeCaptureInputModeRef.current === nextMode) {
      return;
    }

    captureTransitionRef.current = true;
    try {
      await invoke("start_chat_capture", {
        mode: chatKeyPersistenceModeRef.current,
        inputMode: nextMode,
      });

      activeCaptureInputModeRef.current = nextMode;
      setActiveCaptureInputMode(nextMode);

      if (nextMode === "ime") {
        await appWindowRef.current?.setFocus();
        window.setTimeout(() => {
          inputRef.current?.focusImeInput();
        }, 0);
      }
    } catch (err) {
      console.error("Failed to switch chat capture mode:", err);
    } finally {
      captureTransitionRef.current = false;
    }
  }, []);

  const openChatCapture = useCallback(async (source: CaptureOpenSource = "slash") => {
    if (
      captureTransitionRef.current ||
      endingCaptureRef.current ||
      chatCaptureActiveRef.current
    ) {
      return;
    }

    captureTransitionRef.current = true;
    try {
      const shouldStealFocus = await invoke<boolean>("should_steal_focus");
      if (!shouldStealFocus) return;

      const captureInputMode: ChatInputMode =
        source === "click" && chatInputModeRef.current === "focusless"
          ? "ime"
          : chatInputModeRef.current;

      await invoke("start_chat_capture", {
        mode: chatKeyPersistenceModeRef.current,
        inputMode: captureInputMode,
      });

      chatCaptureActiveRef.current = true;
      setChatCaptureActive(true);
      activeCaptureInputModeRef.current = captureInputMode;
      setActiveCaptureInputMode(captureInputMode);
      setShowFavoritesPanel(false);

      if (captureInputMode === "ime") {
        await appWindowRef.current?.setFocus();
        window.setTimeout(() => {
          inputRef.current?.focusImeInput();
        }, 0);
      }
    } catch (err) {
      console.error("Failed to start chat capture:", err);
    } finally {
      captureTransitionRef.current = false;
    }
  }, []);

  useEffect(() => {
    const unlisten = listen<GlobalKeyPayload>("global-key", async (event) => {
      const payload = event.payload;
      if (!payload || typeof payload.code !== "string") return;

      if (!chatCaptureActiveRef.current) {
        if (payload.phase === "down" && payload.code === "Slash") {
          await openChatCapture("slash");
        }
        return;
      }

      if (
        activeCaptureInputModeRef.current === "ime" &&
        payload.phase === "down" &&
        payload.code === "Slash" &&
        !payload.repeat &&
        !document.hasFocus()
      ) {
        await switchActiveCaptureInputMode("focusless");
        return;
      }

      if (activeCaptureInputModeRef.current === "focusless") {
        const action = await inputRef.current?.handleGlobalKey(payload);
        if (action === "submit") {
          await handleCaptureSubmit();
        } else if (action === "cancel") {
          await handleCaptureCancel();
        }
        return;
      }

      if (payload.phase === "down" && payload.code === "Escape") {
        await handleCaptureCancel();
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, [handleCaptureCancel, handleCaptureSubmit, openChatCapture, switchActiveCaptureInputMode]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (chatCaptureActiveRef.current) {
      void handleCaptureSubmit();
      return;
    }

    if (!text.trim()) {
      invoke("focus_roblox").catch((err) => console.error(err));
      return;
    }

    const didQueue = sendMessage(replaceEmojiShortcodes(text));
    if (!didQueue) return;
    shouldAutoScrollRef.current = true;
    setText("");
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

    if (chatCaptureActiveRef.current && activeCaptureInputModeRef.current === "ime") {
      void appWindowRef.current?.setFocus().then(() => {
        inputRef.current?.focusImeInput();
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div ref={scrollContentRef} className="flex flex-col py-4">
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
                key={msg.clientId}
                message={msg}
                isContinuation={isContinuation}
                onToggleFavoriteMedia={handleToggleFavoriteMedia}
                isMediaFavorited={isMediaFavorited}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative">
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
          <div className="flex-1 min-w-0">
            <ChatInput
              ref={inputRef}
              value={text}
              onChange={setText}
              messages={messages}
              maxLength={chatLimits.maxMessageLength}
              mode={chatCaptureActive ? activeCaptureInputMode : chatInputMode}
              captureActive={chatCaptureActive}
              onSubmit={() => {
                void handleCaptureSubmit();
              }}
              onCancel={() => {
                void handleCaptureCancel();
              }}
              onFocusRequest={() => {
                if (!chatCaptureActiveRef.current) {
                  void openChatCapture("click");
                } else if (activeCaptureInputModeRef.current === "ime") {
                  inputRef.current?.focusImeInput();
                }
              }}
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
