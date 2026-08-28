import "dotenv/config";
import { createAuthWorkosApp } from "./http.js";

function listenAddr(raw: string): { host: string; port: number } {
  const trimmed = raw.trim();
  const sep = trimmed.lastIndexOf(":");
  const port = Number(trimmed.slice(sep + 1));
  if (sep <= 0 || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("AUTH_WORKOS_LISTEN_ADDR must be host:port");
  }
  return { host: trimmed.slice(0, sep), port };
}

const { host, port } = listenAddr(
  process.env.AUTH_WORKOS_LISTEN_ADDR?.trim() || "127.0.0.1:3000",
);
const app = createAuthWorkosApp();
app.listen(port, host, () => {
  process.stdout.write(`auth-workos listening on http://${host}:${port}\n`);
});
