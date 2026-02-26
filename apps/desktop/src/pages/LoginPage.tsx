import { SiRoblox } from "react-icons/si";
import { LuJoystick, LuMessageCircle } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

export const LoginPage = () => {
  const {
    user,
    login,
    loading,
    verificationCode,
    verificationExpiresAt,
    verificationPlaceId,
  } = useAuth();
  const nav = useNavigate();

  const [showLoading, setShowLoading] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setShowLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!verificationExpiresAt) {
      setSecondsLeft(0);
      return;
    }

    const update = () => {
      const remainingMs = verificationExpiresAt - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(remainingMs / 1000)));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [verificationExpiresAt]);

  const joinVerificationGame = async () => {
    if (!verificationPlaceId) return;

    try {
      await openUrl(`https://www.roblox.com/games/${verificationPlaceId}`);
    } catch (error) {
      console.error("Failed to open verification game:", error);
    }
  };

  if (loading || showLoading)
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <img src="/app-icon.png" className="w-32 h-32 mb-8 animate-bounce" />
      </div>
    );

  if (user) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <img src="/app-icon.png" className="w-32 h-32 mb-8" />
        <h1 className="text-2xl mb-2 font-bold">
          Welcome back,
          <br />
          {user.username}
        </h1>
        <p className="text-muted-foreground text-sm mb-6">You are logged in.</p>
        <Button onClick={() => nav("/")}>
          <LuMessageCircle size={16} />
          Go to chat
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 text-center">
      <img src="/app-icon.png" className="w-32 h-32 mb-8 animate-pulse" />

      <h1 className="text-2xl mb-2 font-bold">Welcome to BloxChat</h1>
      {verificationCode && secondsLeft > 0 ? (
        <>
          <p className="text-muted-foreground text-sm mb-4">
            Join the verification game and submit this code:
          </p>
          <div className="mb-2 rounded-md border border-border bg-card px-6 py-3 text-2xl font-mono font-bold tracking-[0.2em]">
            {verificationCode}
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            Expires in {secondsLeft}s
          </p>
          <Button onClick={joinVerificationGame} disabled={!verificationPlaceId}>
            <LuJoystick size={16} />
            Join verification game
          </Button>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm mb-6">
            Authorize with your Roblox account
          </p>
          <Button onClick={login}>
            <SiRoblox size={16} />
            Start Verification
          </Button>
        </>
      )}
    </div>
  );
};
