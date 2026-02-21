import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@bloxchat/api";
import { createWSClient, httpBatchLink, wsLink, splitLink } from "@trpc/client";
import { load } from "@tauri-apps/plugin-store";

export const trpc = createTRPCReact<AppRouter>();

const storePromise = load("store.json");

const wsClient = createWSClient({
  url: import.meta.env.VITE_API_URL.replace("https", "wss").replace(
    "http",
    "ws",
  ),
});

export const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition(op) {
        return op.type === "subscription";
      },
      true: wsLink({ client: wsClient }),
      false: httpBatchLink({
        url: import.meta.env.VITE_API_URL,
        async headers() {
          const store = await storePromise;
          const saved = (await store.get("auth")) as { jwt: string } | null;
          return saved ? { Authorization: `Bearer ${saved.jwt}` } : {};
        },
      }),
    }),
  ],
});
