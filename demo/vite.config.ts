/**
 * Demo server only. Ordinary text is posted to /send so the page can show
 * that a send happened. The handler does not read or log the body: a blocked
 * draft must never reach this route, and a secret must not land in the log.
 *
 * Lives in demo/ so Vitest keeps the project root, and so this file stays out
 * of the browser tsconfig (no Node types on the package).
 */

import type { Plugin } from "vite";
import { defineConfig } from "vite";

const acceptSend = (): Plugin => ({
  name: "accept-send",
  configureServer(server) {
    server.middlewares.use("/send", (req, res, next) => {
      if (req.method !== "POST") {
        next();
        return;
      }
      req.resume();
      res.statusCode = 204;
      res.end();
    });
  },
});

export default defineConfig({
  plugins: [acceptSend()],
  // IPv4 explicitly. The default localhost listen can bind IPv6 only when
  // 127.0.0.1 is already taken, and the browser then opens the other server.
  server: {
    host: "127.0.0.1",
  },
});
