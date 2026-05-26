const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dns = require("node:dns");
const net = require("node:net");
const tls = require("node:tls");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");

dns.setDefaultResultOrder("ipv4first");
loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const sessions = new Map();

const CONFIG = {
  username: process.env.APP_USERNAME || "demo",
  password: process.env.APP_PASSWORD || "demo123",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
  openaiProxyUrl:
    process.env.OPENAI_PROXY_URL ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY ||
    "",
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/api/login" && req.method === "POST") {
      return handleLogin(req, res);
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      return handleLogout(req, res);
    }

    if (url.pathname === "/api/session" && req.method === "GET") {
      return handleSession(req, res);
    }

    if (url.pathname === "/api/ask" && req.method === "POST") {
      return handleAsk(req, res);
    }

    if (url.pathname.startsWith("/api/")) {
      return sendJson(res, 404, { error: "接口不存在" });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "服务器内部错误" });
  }
});

server.listen(PORT, () => {
  console.log(`Web app running at http://localhost:${PORT}`);
});

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.replace(/^\uFEFF/, "").trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;

    process.env[key] = stripEnvQuotes(rawValue.trim());
  }
}

function stripEnvQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = String(body.username || "");
  const password = String(body.password || "");

  if (username !== CONFIG.username || password !== CONFIG.password) {
    return sendJson(res, 401, { error: "用户名或密码不正确" });
  }

  const sessionId = crypto.randomBytes(32).toString("hex");
  sessions.set(sessionId, {
    username,
    createdAt: Date.now(),
  });

  res.setHeader("Set-Cookie", makeSessionCookie(sessionId));
  return sendJson(res, 200, { username });
}

function handleLogout(req, res) {
  const sessionId = getSessionId(req);
  if (sessionId) sessions.delete(sessionId);

  res.setHeader(
    "Set-Cookie",
    "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
  );
  return sendJson(res, 200, { ok: true });
}

function handleSession(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 200, { loggedIn: false });

  return sendJson(res, 200, {
    loggedIn: true,
    username: session.username,
    model: CONFIG.openaiModel,
  });
}

async function handleAsk(req, res) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: "请先登录" });

  const body = await readJson(req);
  const question = String(body.question || "").trim();

  if (!question) return sendJson(res, 400, { error: "问题不能为空" });
  if (question.length > 4000) {
    return sendJson(res, 400, { error: "问题太长，请控制在 4000 字以内" });
  }

  if (!CONFIG.openaiApiKey) {
    return sendJson(res, 500, {
      error: "还没有配置 OPENAI_API_KEY。请在 .env 或系统环境变量中填写后重启服务器。",
    });
  }

  let answer;
  try {
    answer = await askOpenAI(question);
  } catch (error) {
    return sendJson(res, 502, {
      error: `OpenAI 请求失败：${error.message}`,
    });
  }

  return sendJson(res, 200, {
    answer,
    model: CONFIG.openaiModel,
  });
}

async function askOpenAI(question) {
  const response = await fetchOpenAI("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CONFIG.openaiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: CONFIG.openaiModel,
      instructions:
        "你是网页中的中文问答助手。请回答清楚、简洁；如果问题需要代码，给出可执行的关键步骤。",
      input: question,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data.error?.message || `OpenAI API 请求失败，状态码 ${response.status}`;
    throw new Error(message);
  }

  return extractOutputText(data);
}

async function fetchOpenAI(url, options) {
  if (!CONFIG.openaiProxyUrl) return fetch(url, options);

  const proxyUrl = normalizeProxyUrl(CONFIG.openaiProxyUrl);
  if (proxyUrl.protocol !== "http:") {
    throw new Error("OPENAI_PROXY_URL only supports HTTP proxies, for example http://127.0.0.1:7890");
  }

  return fetchViaHttpProxy(url, options, proxyUrl);
}

function normalizeProxyUrl(value) {
  let text = String(value || "").trim();
  if (!text) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `http://${text}`;
  return new URL(text);
}

function fetchViaHttpProxy(urlString, options, proxyUrl) {
  const targetUrl = new URL(urlString);
  const method = options.method || "GET";
  const body = options.body || "";
  const bodyLength = Buffer.byteLength(body);
  const requestPath = `${targetUrl.pathname}${targetUrl.search}`;
  const proxyPort = Number(proxyUrl.port || 80);

  return new Promise((resolve, reject) => {
    let settled = false;
    let secureSocket;
    let responseBuffer = Buffer.alloc(0);

    const socket = net.connect({
      host: proxyUrl.hostname,
      port: proxyPort,
    });

    const timeout = setTimeout(() => {
      fail(new Error(`Proxy connection timed out: ${proxyUrl.host}`));
    }, 30000);

    function fail(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (secureSocket) secureSocket.destroy();
      socket.destroy();
      reject(error);
    }

    socket.once("error", fail);
    socket.once("connect", () => {
      const authHeader = makeProxyAuthHeader(proxyUrl);
      const connectHeaders = [
        `CONNECT ${targetUrl.hostname}:443 HTTP/1.1`,
        `Host: ${targetUrl.hostname}:443`,
      ];

      if (authHeader) connectHeaders.push(authHeader);
      connectHeaders.push("Connection: close", "", "");
      socket.write(connectHeaders.join("\r\n"));
    });

    let connectBuffer = Buffer.alloc(0);
    socket.on("data", onProxyConnectData);

    function onProxyConnectData(chunk) {
      connectBuffer = Buffer.concat([connectBuffer, chunk]);
      const headerEnd = connectBuffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const proxyHeader = connectBuffer.subarray(0, headerEnd).toString("latin1");
      if (!/^HTTP\/1\.[01] 200\b/.test(proxyHeader)) {
        fail(new Error(`Proxy CONNECT failed: ${proxyHeader.split("\r\n")[0]}`));
        return;
      }

      socket.removeListener("data", onProxyConnectData);
      socket.removeListener("error", fail);

      secureSocket = tls.connect({
        socket,
        servername: targetUrl.hostname,
      });

      secureSocket.once("error", fail);
      secureSocket.once("secureConnect", () => {
        const requestHeaders = {
          Host: targetUrl.host,
          Connection: "close",
          ...options.headers,
          "Content-Length": String(bodyLength),
        };

        const headerLines = Object.entries(requestHeaders).map(
          ([key, value]) => `${key}: ${value}`
        );

        secureSocket.write(
          [`${method} ${requestPath} HTTP/1.1`, ...headerLines, "", body].join(
            "\r\n"
          )
        );
      });

      secureSocket.on("data", (chunk) => {
        responseBuffer = Buffer.concat([responseBuffer, chunk]);
      });

      secureSocket.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);

        try {
          resolve(makeProxyResponse(responseBuffer));
        } catch (error) {
          reject(error);
        }
      });
    }
  });
}

function makeProxyAuthHeader(proxyUrl) {
  if (!proxyUrl.username) return "";

  const username = decodeURIComponent(proxyUrl.username);
  const password = decodeURIComponent(proxyUrl.password);
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Proxy-Authorization: Basic ${token}`;
}

function makeProxyResponse(buffer) {
  const headerEnd = buffer.indexOf("\r\n\r\n");
  if (headerEnd === -1) throw new Error("Invalid response from OpenAI API");

  const headerText = buffer.subarray(0, headerEnd).toString("latin1");
  const bodyBuffer = buffer.subarray(headerEnd + 4);
  const headerLines = headerText.split("\r\n");
  const statusMatch = headerLines[0].match(/^HTTP\/1\.[01]\s+(\d+)/);
  const status = statusMatch ? Number(statusMatch[1]) : 0;
  const headers = parseRawHeaders(headerLines.slice(1));
  const rawBody =
    headers["transfer-encoding"]?.toLowerCase() === "chunked"
      ? decodeChunkedBody(bodyBuffer)
      : bodyBuffer;
  const text = rawBody.toString("utf8");

  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text || "{}"),
  };
}

function parseRawHeaders(lines) {
  const headers = {};
  for (const line of lines) {
    const index = line.indexOf(":");
    if (index === -1) continue;

    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    headers[key] = value;
  }

  return headers;
}

function decodeChunkedBody(buffer) {
  let cursor = 0;
  const chunks = [];

  while (cursor < buffer.length) {
    const lineEnd = buffer.indexOf("\r\n", cursor);
    if (lineEnd === -1) break;

    const sizeLine = buffer
      .subarray(cursor, lineEnd)
      .toString("latin1")
      .split(";")[0];
    const size = Number.parseInt(sizeLine, 16);
    if (!Number.isFinite(size) || size < 0) break;
    if (size === 0) break;

    const chunkStart = lineEnd + 2;
    const chunkEnd = chunkStart + size;
    chunks.push(buffer.subarray(chunkStart, chunkEnd));
    cursor = chunkEnd + 2;
  }

  return Buffer.concat(chunks);
}

function extractOutputText(data) {
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const chunks = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") chunks.push(content.text);
    }
  }

  if (chunks.length) return chunks.join("\n").trim();
  return "模型已返回结果，但服务器没有识别到文本内容。";
}

function getSession(req) {
  const sessionId = getSessionId(req);
  if (!sessionId) return null;

  const session = sessions.get(sessionId);
  if (!session) return null;

  const maxAgeMs = 1000 * 60 * 60 * 8;
  if (Date.now() - session.createdAt > maxAgeMs) {
    sessions.delete(sessionId);
    return null;
  }

  return session;
}

function getSessionId(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function makeSessionCookie(sessionId) {
  return [
    `session=${encodeURIComponent(sessionId)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    "Max-Age=28800",
  ].join("; ");
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let payload = "";

    req.on("data", (chunk) => {
      payload += chunk;
      if (payload.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("请求体过大"));
      }
    });

    req.on("end", () => {
      if (!payload) return resolve({});
      try {
        resolve(JSON.parse(payload));
      } catch {
        reject(new Error("JSON 格式不正确"));
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function serveStatic(urlPath, res) {
  const requestedPath = urlPath === "/" ? "/index.html" : urlPath;
  const decoded = decodeURIComponent(requestedPath);
  const filePath = path.normalize(path.join(PUBLIC_DIR, decoded));

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600",
    });
    res.end(content);
  });
}
