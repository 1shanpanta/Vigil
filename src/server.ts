import type { Server } from "bun";
import { resolve } from "node:path";
import type { ErrorEntry } from "./types";
import type { ErrorTracker } from "./tracker";

export function createServer(tracker: ErrorTracker, port: number): Server {
  const dashboardPath = resolve(import.meta.dir, "dashboard.html");

  const server = Bun.serve({
    port,
    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/ws") {
        if (server.upgrade(req)) return undefined;
        return new Response("WebSocket upgrade failed", { status: 500 });
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(Bun.file(dashboardPath), {
          headers: { "Content-Type": "text/html" },
        });
      }

      if (url.pathname === "/api/stats") {
        return Response.json(tracker.getFullState());
      }

      return new Response("Not found", { status: 404 });
    },

    websocket: {
      open(ws) {
        ws.subscribe("dashboard");
        ws.send(JSON.stringify({
          type: "init",
          data: tracker.getFullState(),
        }));
      },
      message() {},
      close(ws) {
        ws.unsubscribe("dashboard");
      },
    },
  });

  // Broadcast aggregate stats every second
  setInterval(() => {
    server.publish(
      "dashboard",
      JSON.stringify({
        type: "batch",
        data: {
          stats: tracker.getStats(),
          rate: tracker.getRateHistory(),
          distribution: tracker.getDistribution(),
          endpoints: tracker.getTopEndpoints(),
        },
      })
    );
  }, 1000);

  return server;
}

export function broadcastError(server: Server, error: ErrorEntry): void {
  server.publish("dashboard", JSON.stringify({ type: "error", data: error }));
}
