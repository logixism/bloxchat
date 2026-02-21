import { useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import { MainLayout } from "./pages/Layout";
import { MainChat } from "./pages/MainChat";
import { SettingsPage } from "./pages/SettingsPage";
import { ChatProvider } from "./contexts/ChatContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./components/RequireAuth";
import { getGuiOpacity, getLogsPath } from "./lib/store";

export default function App() {
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

  return (
    <AuthProvider>
      <ChatProvider>
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
