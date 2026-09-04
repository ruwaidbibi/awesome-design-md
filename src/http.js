import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
};

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(body);
}

export async function readJsonBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
}

export class HttpError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

/** Server-sent events channel. Returns { send, close }. */
export function openSse(res) {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.write(": open\n\n");
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 15_000);
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(keepAlive);
    res.end();
  };
  res.on("close", () => {
    closed = true;
    clearInterval(keepAlive);
  });
  return {
    send(event, data) {
      if (closed) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close,
    get closed() {
      return closed;
    },
  };
}

/**
 * Serve a file from `root`, refusing anything that escapes it.
 * `urlPath` is the already-decoded path *below* the mount point.
 */
export function serveStatic(res, root, urlPath, { indexFile = "index.html" } = {}) {
  const rel = urlPath.replace(/^\/+/, "");
  let target = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (target !== rootResolved && !target.startsWith(rootResolved + path.sep)) {
    sendText(res, 403, "Forbidden");
    return true;
  }
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return false;
  }
  if (stat.isDirectory()) {
    target = path.join(target, indexFile);
    try {
      stat = fs.statSync(target);
    } catch {
      return false;
    }
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(target).toLowerCase()] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  fs.createReadStream(target).pipe(res);
  return true;
}

/** Tiny pattern router: "/api/businesses/:id/generate". */
export function createRouter() {
  const routes = [];
  const add = (method, pattern, handler) => {
    const keys = [];
    const regex = new RegExp(
      "^" +
        pattern
          .split("/")
          .map((seg) => {
            if (!seg.startsWith(":")) return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            keys.push(seg.slice(1));
            return "([^/]+)";
          })
          .join("/") +
        "$",
    );
    routes.push({ method, regex, keys, handler });
  };
  return {
    get: (p, h) => add("GET", p, h),
    post: (p, h) => add("POST", p, h),
    patch: (p, h) => add("PATCH", p, h),
    delete: (p, h) => add("DELETE", p, h),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const m = route.regex.exec(pathname);
        if (!m) continue;
        const params = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}
