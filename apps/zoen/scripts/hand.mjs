import http from "node:http";
import { crc32 } from "node:zlib";

const port = Number(process.env.ZOEN_HAND_PORT ?? "58726");

const pedidoTen = Buffer.from(JSON.stringify({ quantity: "10" }), "utf8");
const laudoZip = zipStore("pedido.json", pedidoTen);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    return json(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/oauth/token") {
    return json(response, 200, { access_token: "hand-oauth-token", token_type: "Bearer" });
  }
  if (request.method === "GET" && url.pathname === "/drive/v3/files") {
    const q = url.searchParams.get("q") ?? "";
    if (q.includes("application/vnd.google-apps.folder") && q.includes("Laudos")) {
      return json(response, 200, {
        files: [{ id: "folder.laudos", name: "Laudos", mimeType: "application/vnd.google-apps.folder" }],
      });
    }
    if (q.includes("folder.laudos")) {
      return json(response, 200, {
        files: [
          {
            id: "file.laudo",
            name: "laudo.zip",
            mimeType: "application/zip",
            modifiedTime: "2026-01-15T09:00:00Z",
          },
        ],
      });
    }
    return json(response, 200, { files: [] });
  }
  if (request.method === "GET" && url.pathname === "/drive/v3/files/file.laudo") {
    response.writeHead(200, {
      "content-type": "application/zip",
      "content-length": String(laudoZip.length),
    });
    response.end(laudoZip);
    return;
  }
  if (request.method === "GET" && url.pathname === "/pedidos") {
    return json(response, 200, { data: [{ id: 1, quantidade: "12" }], cursor: null });
  }
  if (request.method === "GET" && url.pathname === "/protheus/notas") {
    return json(response, 200, { items: [{ quantidade: "12" }], cursor: null });
  }
  if (request.method === "POST" && url.pathname === "/mcp") {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      const body = JSON.parse(raw || "{}");
      if (body.method === "initialize") {
        return json(response, 200, {
          jsonrpc: "2.0",
          id: body.id ?? 1,
          result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "hand" } },
        });
      }
      if (body.method === "tools/call") {
        return json(response, 200, {
          jsonrpc: "2.0",
          id: body.id ?? 1,
          result: { quantity: "12", cursor: null },
        });
      }
      return json(response, 200, {
        jsonrpc: "2.0",
        id: body.id ?? 1,
        error: { code: -32601, message: `unknown ${body.method}` },
      });
    });
    return;
  }
  json(response, 404, { error: "not found", path: url.pathname });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`hand listening 127.0.0.1:${port}\n`);
});

function json(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, { "content-type": "application/json", "content-length": String(bytes.length) });
  response.end(bytes);
}

function zipStore(name, payload) {
  const nameBuf = Buffer.from(name);
  const crc = crc32(payload) >>> 0;
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(local, 30);
  const data = Buffer.concat([local, payload]);
  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  nameBuf.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(data.length, 16);
  return Buffer.concat([data, central, end]);
}
