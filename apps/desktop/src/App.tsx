import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { MainLayout } from "./pages/Layout";
import { MainChat } from "./pages/MainChat";
import { SettingsPage } from "./pages/SettingsPage";
import { ChatProvider } from "./contexts/ChatContext";
import { AuthProvider } from "./contexts/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RequireAuth } from "./components/RequireAuth";

export default function App() {
  return (
    <AuthProvider>
      <ChatProvider>
        <Router>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route path="auth" element={<LoginPage />} />

              <Route element={<RequireAuth />}>
                <Route index element={<MainChat />} />
                <Route path="settings" element={<SettingsPage />} />{" "}
              </Route>
            </Route>
          </Routes>
        </Router>
      </ChatProvider>
    </AuthProvider>
  );
}
