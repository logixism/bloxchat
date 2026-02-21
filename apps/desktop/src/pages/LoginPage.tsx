import { SiRoblox } from "react-icons/si";
import { LuMessageCircle } from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";

export const LoginPage = () => {
  const { user, login, loading } = useAuth();
  const nav = useNavigate();

  if (user) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-6 p-8 text-center">
        <h1 className="text-2xl font-bold">
          Welcome back, {user.displayName || user.name}!
        </h1>
        <p className="text-muted-foreground text-sm">You are logged in.</p>
        <button
          onClick={() => nav("/")}
          className="flex flex-row gap-2 items-center bg-brand hover:bg-brand/80 text-white px-4 py-2 rounded-md font-medium transition-colors"
        >
          <LuMessageCircle size={16} />
          Go to chat
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-6 p-8 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">Welcome to BloxChat</h1>
        <p className="text-muted-foreground text-sm">
          Please sign in to continue
        </p>
      </div>
      <button
        onClick={login}
        className="flex flex-row gap-2 items-center bg-blue-500 hover:bg-blue-500/80 text-white px-4 py-2 rounded-md font-medium transition-colors"
      >
        <SiRoblox size={16} />
        {loading ? "Logging in..." : "Login with Roblox"}
      </button>
    </div>
  );
};
