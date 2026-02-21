import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import { load } from "@tauri-apps/plugin-store";
import { getCurrent, onOpenUrl } from "@tauri-apps/plugin-deep-link";
import { trpc } from "../lib/trpc";
import { openUrl } from "@tauri-apps/plugin-opener";

interface AuthContextValue {
  user: any | null;
  loading: boolean;
  login: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const storePromise = load("store.json", {
  autoSave: true,
  defaults: { auth: null },
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      setUser(data.user);
      setLoading(false);
      const store = await storePromise;
      await store.set("auth", data);
      await store.save();
    },
    onError: (err) => {
      console.error("Login failed", err);
      setLoading(false);
    },
  });

  const verifyMutation = trpc.auth.verify.useMutation({
    onSuccess: async (data) => {
      setUser(data.user);
      setLoading(false);
      const store = await storePromise;
      await store.set("auth", data);
      await store.save();
    },
    onError: () => {
      setUser(null);
      setLoading(false);
    },
  });

  useEffect(() => {
    const loadAuth = async () => {
      const store = await storePromise;
      const saved = (await store.get("auth")) as { jwt: string } | null;
      if (saved) {
        setLoading(true);
        verifyMutation.mutate({ jwt: saved.jwt });
      }
    };
    loadAuth();
  }, []);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const setup = async () => {
      const handleUrl = (urlStr: string) => {
        const url = new URL(urlStr);
        const code = url.searchParams.get("code");
        if (code) {
          setLoading(true);
          loginMutation.mutate({ code });
        }
      };

      const startUrls = await getCurrent();
      (Array.isArray(startUrls) ? startUrls : [startUrls]).forEach((url) => {
        if (url) handleUrl(url);
      });

      cleanup = await onOpenUrl((urls) => {
        urls.forEach((url) => handleUrl(url));
      });
    };

    setup();

    return () => {
      cleanup?.();
    };
  }, []);

  const login = () => {
    const clientId = import.meta.env.VITE_ROBLOX_CLIENT_ID;
    const redirectUri = "bloxchat://auth";

    const oauthUrl =
      `https://apis.roblox.com/oauth/v1/authorize` +
      `?client_id=${clientId}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid profile`;

    openUrl(oauthUrl);
  };

  return (
    <AuthContext.Provider value={{ user, login, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
