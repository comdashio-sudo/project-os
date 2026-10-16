import "dotenv/config";
import { createServer } from "http";
import net from "net";
import { createApp } from "./app";
import { installProcessErrorLogging, logError, logInfo } from "./logger";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const { app, finish } = createApp({ production: process.env.NODE_ENV !== "development" });
  const server = createServer(app);
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  finish(app);

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    logInfo("server.port_busy", { preferredPort, port });
  }

  server.listen(port, () => {
    logInfo("server.listening", { port });
  });
}

installProcessErrorLogging();
startServer().catch(error => { logError("server.start_failed", error); process.exitCode = 1; });
