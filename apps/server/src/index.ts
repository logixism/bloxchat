import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { applyWSSHandler } from "@trpc/server/adapters/ws";
import { appRouter, createContext } from "@bloxchat/api";
import { WebSocketServer } from "ws";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const serverInstance = createHTTPServer({
  router: appRouter,
  createContext,
  middleware: cors(),
});

const wss = new WebSocketServer({
  server: serverInstance,
});

const handler = applyWSSHandler({
  wss,
  router: appRouter,
  createContext,
});

process.on("SIGTERM", () => {
  handler.broadcastReconnectNotification();
  wss.close();
});

serverInstance.listen(3000);
console.log("tRPC server running at ");
