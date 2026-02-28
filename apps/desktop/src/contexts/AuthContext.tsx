import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { trpc, trpcClient } from "../lib/trpc";
import { AuthSession, getAuthSession, setAuthSession } from "../lib/store";

type VerificationSession = {
  sessionId: string;
  code: string;
  expiresAt: number;
  placeId: string;
};

interface AuthContextValue {
  user: AuthSession["user"] | null;
  loading: boolean;
  verificationCode: string | null;
  verificationExpiresAt: number | null;
  verificationPlaceId: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthContextValue["user"]>(null);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [verificationSession, setVerificationSession] =
    useState<VerificationSession | null>(null);
  const isRefreshingRef = useRef(false);
  const isCheckingVerificationRef = useRef(false);

  const applyAuthState = async (data: {
    jwt: string;
    user: AuthContextValue["user"];
  }) => {
    if (!data.user) {
      await clearAuthState();
      return;
    }

    setUser(data.user);
    await setAuthSession({
      jwt: data.jwt,
      user: data.user,
    });
  };

  const clearAuthState = async () => {
    setUser(null);
    await setAuthSession(null);
  };

  const refreshMutation = trpc.auth.refresh.useMutation();
  const beginVerificationMutation = trpc.auth.beginVerification.useMutation();

  const refreshSession = async () => {
    if (isRefreshingRef.current) return false;

    const saved = await getAuthSession();
    if (!saved?.jwt) {
      await clearAuthState();
      return false;
    }

    try {
      isRefreshingRef.current = true;
      const data = await refreshMutation.mutateAsync({ jwt: saved.jwt });
      await applyAuthState(data);
      return true;
    } catch (err) {
      const isUnauthorized = (err as any)?.data?.code === "UNAUTHORIZED";
      if (isUnauthorized) {
        await clearAuthState();
      }
      return false;
    } finally {
      isRefreshingRef.current = false;
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const saved = await getAuthSession();
      if (saved?.jwt) {
        setUser(saved.user);
        await refreshSession();
      }
      setLoading(false);
      setAuthReady(true);
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!verificationSession || user) return;

    let disposed = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleNextPoll = (delayMs: number) => {
      if (disposed) return;
      timeout = setTimeout(() => {
        void pollVerification();
      }, delayMs);
    };

    const pollVerification = async () => {
      if (disposed || isCheckingVerificationRef.current) return;
      if (Date.now() >= verificationSession.expiresAt) {
        setVerificationSession(null);
        return;
      }

      try {
        isCheckingVerificationRef.current = true;
        const result = await trpcClient.auth.checkVerification.mutate({
          sessionId: verificationSession.sessionId,
        });

        if (disposed) return;
        if (result.status === "verified") {
          try {
            await applyAuthState({ jwt: result.jwt, user: result.user });
          } catch (error) {
            console.error("Failed to apply verified session:", error);
            await clearAuthState();
          } finally {
            setVerificationSession(null);
          }
          return;
        } else if (result.status === "expired") {
          setVerificationSession(null);
          return;
        }
      } catch (err) {
        console.error("Verification polling failed:", err);
      } finally {
        isCheckingVerificationRef.current = false;
      }

      scheduleNextPoll(3_000);
    };

    scheduleNextPoll(0);

    return () => {
      disposed = true;
      if (timeout) clearTimeout(timeout);
    };
  }, [
    user,
    verificationSession?.expiresAt,
    verificationSession?.sessionId,
  ]);

  useEffect(() => {
    if (!authReady || !user) return;

    const interval = setInterval(
      () => {
        void refreshSession();
      },
      45 * 60 * 1000,
    );

    return () => clearInterval(interval);
  }, [authReady, user?.robloxUserId]);

  const login = async () => {
    setLoading(true);
    try {
      const nextVerificationSession =
        await beginVerificationMutation.mutateAsync();
      setVerificationSession(nextVerificationSession);
    } catch (err) {
      console.error("Failed to start verification flow", err);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setVerificationSession(null);
    await clearAuthState();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        loading,
        verificationCode: verificationSession?.code ?? null,
        verificationExpiresAt: verificationSession?.expiresAt ?? null,
        verificationPlaceId: verificationSession?.placeId ?? null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
