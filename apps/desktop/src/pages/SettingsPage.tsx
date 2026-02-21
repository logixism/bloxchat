import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import {
  DEFAULT_API_HOST,
  getApiUrl,
  getGuiOpacity,
  getImageLoadingEnabled,
  getLogsPath,
  setApiUrl,
  setGuiOpacity,
  setImageLoadingEnabled,
  setLogsPath,
} from "../lib/store";
import { Button } from "../components/ui/button";
import { Checkbox } from "../components/ui/checkbox";
import { useNavigate } from "react-router-dom";

export const SettingsPage = () => {
  const [apiUrl, setApiUrlInput] = useState("");
  const [logsPath, setLogsPathInput] = useState("");
  const [activeLogsPath, setActiveLogsPath] = useState("");
  const [defaultLogsPath, setDefaultLogsPath] = useState("");
  const [imageLoadingEnabled, setImageLoadingEnabledInput] = useState(false);
  const [guiOpacity, setGuiOpacityInput] = useState(1);
  const [appVersion, setAppVersion] = useState("Unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [initialApiUrl, setInitialApiUrl] = useState("");
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
          currentVersion,
        ] = await Promise.all([
          getApiUrl(),
          getLogsPath(),
          invoke<string>("get_roblox_logs_path"),
          invoke<string>("get_default_roblox_logs_path"),
          getImageLoadingEnabled(),
          getGuiOpacity(),
          getVersion(),
        ]);

        setApiUrlInput(currentApiUrl);
        setInitialApiUrl(currentApiUrl);
        setActiveLogsPath(currentLogsPath);
        setDefaultLogsPath(fallbackLogsPath);
        setLogsPathInput((storedLogsPath || currentLogsPath).trim());
        setImageLoadingEnabledInput(currentImageLoadingEnabled);
        setGuiOpacityInput(currentGuiOpacity);
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
      const shouldReload = normalizedApiUrl !== initialApiUrl;

      await invoke("set_roblox_logs_path", { path: nextLogsPath });
      await setLogsPath(nextLogsPath);
      await setImageLoadingEnabled(imageLoadingEnabled);

      setApiUrlInput(normalizedApiUrl);
      setLogsPathInput(nextLogsPath);
      setActiveLogsPath(nextLogsPath);
      setGuiOpacityInput(nextOpacity);
      document.documentElement.style.setProperty(
        "--gui-opacity",
        nextOpacity.toString(),
      );
      setInitialApiUrl(normalizedApiUrl);
      setInitialGuiOpacity(nextOpacity);
      if (shouldReload) {
        window.location.reload();
      }
    } catch (saveError) {
      setError(String(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex h-screen w-screen text-primary p-6">
      <div className="w-full max-w-2xl space-y-6">
        <h1 className="text-xl font-bold">Settings</h1>

        <div className="rounded-lg border border-border bg-card p-4 space-y-4">
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

          <div className="space-y-2">
            <label htmlFor="gui-opacity" className="text-sm font-medium">
              GUI Opacity
            </label>
            <div className="flex items-center gap-3">
              <input
                id="gui-opacity"
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={guiOpacity}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
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

          <div className="space-y-1">
            <label className="text-sm font-medium">App Version</label>
            <p className="text-xs text-muted-foreground">{appVersion}</p>
          </div>

          {error ? (
            <p className="text-xs text-red-500 break-all">{error}</p>
          ) : null}

          <Button onClick={save} disabled={isLoading || isSaving}>
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
            className="ml-2"
            disabled={isLoading || isSaving}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
