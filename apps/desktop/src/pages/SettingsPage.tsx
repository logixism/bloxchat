import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  DEFAULT_API_HOST,
  getApiUrl,
  getGuiOpacity,
  getImageLoadingEnabled,
  getJoinMessage,
  getLogsPath,
  setApiUrl,
  setGuiOpacity,
  setImageLoadingEnabled,
  setJoinMessage,
  setLogsPath,
} from "../lib/store";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { Slider } from "../components/ui/slider";

export const SettingsPage = () => {
  const [apiUrl, setApiUrlInput] = useState("");
  const [logsPath, setLogsPathInput] = useState("");
  const [activeLogsPath, setActiveLogsPath] = useState("");
  const [defaultLogsPath, setDefaultLogsPath] = useState("");
  const [imageLoadingEnabled, setImageLoadingEnabledInput] = useState(false);
  const [guiOpacity, setGuiOpacityInput] = useState(1);
  const [joinMessage, setJoinMessageInput] = useState("");
  const [appVersion, setAppVersion] = useState("Unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialApiUrl, setInitialApiUrl] = useState("");
  const [initialLogsPath, setInitialLogsPath] = useState("");
  const [initialImageLoadingEnabled, setInitialImageLoadingEnabled] =
    useState(false);
  const [initialJoinMessage, setInitialJoinMessage] = useState("");
  const [initialGuiOpacity, setInitialGuiOpacity] = useState(1);
  const navigate = useNavigate();

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [
          currentApiUrl,
          storedLogsPath,
          currentLogsPath,
          fallbackLogsPath,
          currentImageLoadingEnabled,
          currentGuiOpacity,
          currentJoinMessage,
          currentVersion,
        ] = await Promise.all([
          getApiUrl(),
          getLogsPath(),
          invoke<string>("get_roblox_logs_path"),
          invoke<string>("get_default_roblox_logs_path"),
          getImageLoadingEnabled(),
          getGuiOpacity(),
          getJoinMessage(),
          getVersion(),
        ]);

        setApiUrlInput(currentApiUrl);
        setInitialApiUrl(currentApiUrl);
        setActiveLogsPath(currentLogsPath);
        setDefaultLogsPath(fallbackLogsPath);
        const resolvedLogsPath = (storedLogsPath || currentLogsPath).trim();
        setLogsPathInput(resolvedLogsPath);
        setInitialLogsPath(resolvedLogsPath);
        setImageLoadingEnabledInput(currentImageLoadingEnabled);
        setInitialImageLoadingEnabled(currentImageLoadingEnabled);
        setGuiOpacityInput(currentGuiOpacity);
        setJoinMessageInput(currentJoinMessage);
        setInitialJoinMessage(currentJoinMessage);
        setInitialGuiOpacity(currentGuiOpacity);
        setAppVersion(currentVersion);
      } catch (loadError) {
        setError(String(loadError));
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const save = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setError("");
    try {
      const normalizedApiUrl = await setApiUrl(apiUrl);
      const nextLogsPath = (logsPath.trim() || defaultLogsPath).trim();
      const nextOpacity = await setGuiOpacity(guiOpacity);
      const nextJoinMessage = await setJoinMessage(joinMessage);
      const shouldReload = normalizedApiUrl !== initialApiUrl;

      await invoke("set_roblox_logs_path", { path: nextLogsPath });
      await setLogsPath(nextLogsPath);
      await setImageLoadingEnabled(imageLoadingEnabled);

      setApiUrlInput(normalizedApiUrl);
      setLogsPathInput(nextLogsPath);
      setActiveLogsPath(nextLogsPath);
      setGuiOpacityInput(nextOpacity);
      setJoinMessageInput(nextJoinMessage);
      document.documentElement.style.setProperty(
        "--gui-opacity",
        nextOpacity.toString(),
      );
      setInitialApiUrl(normalizedApiUrl);
      setInitialLogsPath(nextLogsPath);
      setInitialImageLoadingEnabled(imageLoadingEnabled);
      setInitialGuiOpacity(nextOpacity);
      setInitialJoinMessage(nextJoinMessage);
      if (shouldReload) {
        window.location.reload();
      }
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const normalizedLogsPath = (logsPath.trim() || defaultLogsPath).trim();
  const hasChanges =
    apiUrl !== initialApiUrl ||
    normalizedLogsPath !== initialLogsPath ||
    imageLoadingEnabled !== initialImageLoadingEnabled ||
    Math.abs(guiOpacity - initialGuiOpacity) > 0.0001 ||
    joinMessage !== initialJoinMessage;

  return (
    <div className="flex h-screen w-screen text-primary p-6">
      <div className="w-full max-w-3xl space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Connection</h2>
              <p className="text-xs text-muted-foreground">
                Network and server configuration.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="api-url" className="text-sm font-medium">
                API Server URL
              </label>
              <input
                id="api-url"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={apiUrl}
                onChange={(event) => setApiUrlInput(event.target.value)}
                disabled={isLoading || isSaving}
                placeholder={DEFAULT_API_HOST}
              />
              <p className="text-xs text-muted-foreground">
                Default: {DEFAULT_API_HOST}. Changing this reloads the app.
              </p>
              <Button
                onClick={() => setApiUrlInput(DEFAULT_API_HOST)}
                size={"sm"}
                variant={"secondary"}
                disabled={isLoading || isSaving}
              >
                Reset to default host
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Roblox Integration</h2>
              <p className="text-xs text-muted-foreground">
                Paths used for log watching and game session detection.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="logs-path" className="text-sm font-medium">
                Roblox Logs Folder
              </label>
              <input
                id="logs-path"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={logsPath}
                onChange={(event) => setLogsPathInput(event.target.value)}
                disabled={isLoading || isSaving}
                placeholder={defaultLogsPath}
              />
              <p className="text-xs text-muted-foreground">
                Current watcher path: {activeLogsPath || "Loading..."}
              </p>
              <Button
                onClick={() => setLogsPathInput(defaultLogsPath)}
                size={"sm"}
                variant={"secondary"}
                disabled={isLoading || isSaving || !defaultLogsPath}
              >
                Use default Path
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Privacy & Media</h2>
              <p className="text-xs text-muted-foreground">
                Controls that affect external content loading.
              </p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                External Image Loading
              </label>
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-start gap-1">
                  <label
                    htmlFor="image-loading-enabled"
                    className="flex items-center cursor-pointer text-sm"
                  >
                    <Checkbox
                      id="image-loading-enabled"
                      checked={imageLoadingEnabled}
                      onCheckedChange={(checked) =>
                        setImageLoadingEnabledInput(checked === true)
                      }
                      disabled={isLoading || isSaving}
                      className="mr-2"
                    />
                    Load external images inside chat
                  </label>
                  <p className="text-xs text-muted-foreground ml-6">
                    This checks external URLs and can reveal your IP address to
                    other users.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Appearance</h2>
              <p className="text-xs text-muted-foreground">
                Visual behavior for the desktop client.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="gui-opacity" className="text-sm font-medium">
                GUI Opacity
              </label>
              <div className="flex items-center gap-3">
                <Slider
                  id="gui-opacity"
                  min={0.2}
                  max={1}
                  step={0.02}
                  value={[guiOpacity]}
                  onValueChange={(event) => {
                    const nextValue = Number(event[0]);
                    setGuiOpacityInput(nextValue);
                    document.documentElement.style.setProperty(
                      "--gui-opacity",
                      nextValue.toString(),
                    );
                  }}
                  disabled={isLoading || isSaving}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground w-12 text-right">
                  {Math.round(guiOpacity * 100)}%
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Controls the transparency of the app background.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">Automation</h2>
              <p className="text-xs text-muted-foreground">
                Automatic actions triggered during channel/session changes.
              </p>
            </div>
            <div className="space-y-2">
              <label htmlFor="join-message" className="text-sm font-medium">
                Auto Join Message
              </label>
              <input
                id="join-message"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={joinMessage}
                onChange={(event) => setJoinMessageInput(event.target.value)}
                disabled={isLoading || isSaving}
                placeholder="joined the channel"
              />
              <p className="text-xs text-muted-foreground">
                Sent automatically when your Job ID changes.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h2 className="text-sm font-semibold">About</h2>
            <div className="space-y-1">
              <label className="text-sm font-medium">App Version</label>
              <p className="text-xs text-muted-foreground">{appVersion}</p>
            </div>
          </div>

          {error ? (
            <p className="text-xs text-red-500 break-all">{error}</p>
          ) : null}

          <p className="text-xs text-muted-foreground">
            {hasChanges ? "You have unsaved changes." : "All changes saved."}
          </p>

          <div className="flex items-center gap-2">
            <Button
              onClick={save}
              disabled={isLoading || isSaving || !hasChanges}
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
            <Button
              onClick={() => {
                document.documentElement.style.setProperty(
                  "--gui-opacity",
                  initialGuiOpacity.toString(),
                );
                navigate("/");
              }}
              variant={"secondary"}
              disabled={isLoading || isSaving}
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
