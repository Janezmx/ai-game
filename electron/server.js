/**
 * Electron 生产环境服务器
 * 同时托管前端静态文件和代理后端 API 请求
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const FRONTEND_PORT = 3000;
const BACKEND_PORT = 3001;
const FRONTEND_DIR = path.join(__dirname, "..", "frontend", "dist");
const BACKEND_DIR = path.join(__dirname, "..", "backend");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// 启动 Next.js 后端
function startBackend() {
  const proc = spawn("node", [
    path.join(BACKEND_DIR, "node_modules", ".bin", "next"),
    "start",
    "--port",
    String(BACKEND_PORT),
  ], {
    cwd: BACKEND_DIR,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PORT: String(BACKEND_PORT) },
    shell: process.platform === "win32",
  });

  proc.stdout?.on("data", (d) => process.stdout.write(`[backend] ${d}`));
  proc.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`));
  return proc;
}

// 启动前端静态文件服务器
function startFrontend() {
  const server = http.createServer((req, res) => {
    // API 请求代理到后端
    if (req.url.startsWith("/api/")) {
      const options = {
        hostname: "localhost",
        port: BACKEND_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `localhost:${BACKEND_PORT}` },
      };

      const proxyReq = http.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      });

      proxyReq.on("error", () => {
        res.writeHead(502);
        res.end("Backend unavailable");
      });

      req.pipe(proxyReq);
      return;
    }

    // 静态文件
    let filePath = path.join(FRONTEND_DIR, req.url === "/" ? "index.html" : req.url);

    // SPA 路由：如果文件不存在，返回 index.html
    if (!fs.existsSync(filePath)) {
      filePath = path.join(FRONTEND_DIR, "index.html");
    }

    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Server Error");
        return;
      }
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    });
  });

  server.listen(FRONTEND_PORT, () => {
    console.log(`[frontend] static server on http://localhost:${FRONTEND_PORT}`);
  });

  return server;
}

module.exports = { startFrontend, startBackend };
