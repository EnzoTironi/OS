import http from "node:http";
import { crc32 } from "node:zlib";

const port = Number(process.env.ZOEN_HAND_PORT ?? "58726");

const pedidoTen = Buffer.from(JSON.stringify({ quantity: "10" }), "utf8");
const laudoZip = zipStore("pedido.json", pedidoTen);

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && url.pathname === "/health") {
    json(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/oauth/token") {
    json(response, 200, {
      access_token: "hand-oauth-token",
      token_type: "Bearer",
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/drive/v3/files") {
    handleDriveFiles(url, response);
    return;
  }
  if (
    request.method === "GET" &&
    url.pathname === "/drive/v3/files/file.laudo"
  ) {
    response.writeHead(200, {
      "content-length": String(laudoZip.length),
      "content-type": "application/zip",
    });
    response.end(laudoZip);
    return;
  }
  if (request.method === "GET" && url.pathname === "/pedidos") {
    json(response, 200, {
      cursor: null,
      data: [{ id: 1, quantidade: "12" }],
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/protheus/notas") {
    json(response, 200, { cursor: null, items: [{ quantidade: "12" }] });
    return;
  }
  if (request.method === "POST" && url.pathname === "/mcp") {
    handleMcp(request, response);
    return;
  }
  json(response, 404, { error: "not found", path: url.pathname });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`hand listening 127.0.0.1:${port}\n`);
});

function handleDriveFiles(url, response) {
  const q = url.searchParams.get("q") ?? "";
  if (
    q.includes("application/vnd.google-apps.folder") &&
    q.includes("Laudos")
  ) {
    json(response, 200, {
      files: [
        {
          id: "folder.laudos",
          mimeType: "application/vnd.google-apps.folder",
          name: "Laudos",
        },
      ],
    });
    return;
  }
  if (q.includes("folder.laudos")) {
    json(response, 200, {
      files: [
        {
          id: "file.laudo",
          mimeType: "application/zip",
          modifiedTime: "2026-01-15T09:00:00Z",
          name: "laudo.zip",
        },
      ],
    });
    return;
  }
  json(response, 200, { files: [] });
}

function handleMcp(request, response) {
  let raw = "";
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    handleMcpBody(response, JSON.parse(raw || "{}"));
  });
}

function handleMcpBody(response, body) {
  if (body.method === "initialize") {
    json(response, 200, {
      id: body.id ?? 1,
      jsonrpc: "2.0",
      result: {
        capabilities: {},
        protocolVersion: "2024-11-05",
        serverInfo: { name: "hand" },
      },
    });
    return;
  }
  if (body.method === "tools/call") {
    json(response, 200, {
      id: body.id ?? 1,
      jsonrpc: "2.0",
      result: { cursor: null, quantity: "12" },
    });
    return;
  }
  json(response, 200, {
    error: { code: -32_601, message: `unknown ${body.method}` },
    id: body.id ?? 1,
    jsonrpc: "2.0",
  });
}

function json(response, status, body) {
  const bytes = Buffer.from(JSON.stringify(body), "utf8");
  response.writeHead(status, {
    "content-length": String(bytes.length),
    "content-type": "application/json",
  });
  response.end(bytes);
}

function unsigned32(value) {
  return (value + 4_294_967_296) % 4_294_967_296;
}

function zipStore(name, payload) {
  const nameBuf = Buffer.from(name);
  const crc = unsigned32(crc32(payload));
  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04_03_4b_50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(payload.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  nameBuf.copy(local, 30);
  const data = Buffer.concat([local, payload]);
  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02_01_4b_50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(payload.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  nameBuf.copy(central, 46);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06_05_4b_50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(data.length, 16);
  return Buffer.concat([data, central, end]);
}
