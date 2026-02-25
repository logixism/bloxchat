import { useEffect, useState } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { MainLayout } from "./pages/Layout";
import { MainChat } from "./pages/MainChat";
import { SettingsPage } from "./pages/SettingsPage";
import { ChatProvider } from "./contexts/ChatContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./components/RequireAuth";
import { getGuiOpacity, getLogsPath } from "./lib/store";

type UpdateInstallingNotice = {
  version: string;
  message: string;
};

export default function App() {
  const [updateNotice, setUpdateNotice] = useState<UpdateInstallingNotice | null>(
    null,
  );

  useEffect(() => {
    const applyGuiOpacity = async () => {
      const opacity = await getGuiOpacity();
      document.documentElement.style.setProperty(
        "--gui-opacity",
        opacity.toString(),
      );
    };

    applyGuiOpacity().catch((error) => {
      console.error("Failed to apply GUI opacity:", error);
    });
  }, []);

  useEffect(() => {
    const syncLogsPath = async () => {
      const logsPath = (await getLogsPath()).trim();
      if (!logsPath) return;

      await invoke("set_roblox_logs_path", { path: logsPath });
    };

    syncLogsPath().catch((error) => {
      console.error("Failed to sync Roblox logs path:", error);
    });
  }, []);

  useEffect(() => {
    const unlisten = listen<UpdateInstallingNotice>(
      "updater://about-to-install",
      (event) => {
        setUpdateNotice(event.payload);
      },
    );

    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, []);

  return (
    <AuthProvider>
      <ChatProvider>
        {updateNotice && (
          <div className="fixed inset-x-0 top-10 z-50 flex justify-center px-4">
            <div className="max-w-lg rounded-md border border-brand/50 bg-card/95 px-4 py-3 text-xs text-primary shadow-lg backdrop-blur-sm">
              <p className="font-semibold">Update ready: v{updateNotice.version}</p>
              <p className="text-primary/80">{updateNotice.message}</p>
            </div>
          </div>
        )}
        <Router>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route path="auth" element={<LoginPage />} />

              <Route path="settings" element={<SettingsPage />} />

              <Route element={<RequireAuth />}>
                <Route index element={<MainChat />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </ChatProvider>
    </AuthProvider>
  );
}
