const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const { startFrontend, startBackend } = require("./server");

const isDev = !app.isPackaged;
const BACKEND_PORT = 3001;
const FRONTEND_PORT = 3000;

let mainWindow = null;
let backendProcess = null;
let frontendServer = null;

function waitForServer(url, maxRetries = 30) {
  return new Promise((resolve, reject) => {
    const http = require("http");
    let retries = 0;
    const check = () => {
      http.get(url, (res) => {
        res.resume();
        resolve();
      }).on("error", () => {
        retries++;
        if (retries >= maxRetries) {
          reject(new Error(`Server at ${url} not ready after ${maxRetries} retries`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

function openWindow(url) {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 420,
    height: 780,
    minWidth: 375,
    minHeight: 650,
    title: "清醒边界 - 守护你的心域",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(url);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  if (isDev) {
    // 开发模式：先后端再前端
    const rootDir = path.join(__dirname, "..");
    let backendReady = false;
    let frontendReady = false;

    backendProcess = spawn("npm", ["run", "dev:backend"], {
      cwd: rootDir, stdio: "pipe", shell: process.platform === "win32",
      env: { ...process.env },
    });
    backendProcess.stdout?.on("data", (d) => {
      process.stdout.write(`[backend] ${d}`);
      if (!backendReady && d.toString().includes("localhost")) {
        backendReady = true;
        if (frontendReady) openWindow(`http://localhost:${FRONTEND_PORT}`);
      }
    });
    backendProcess.stderr?.on("data", (d) => process.stderr.write(`[backend] ${d}`));

    // 启动前端 Vite
    const frontendProcess2 = spawn("npm", ["run", "dev:frontend"], {
      cwd: rootDir, stdio: "pipe", shell: process.platform === "win32",
      env: { ...process.env },
    });
    frontendProcess2.stdout?.on("data", (d) => {
      process.stdout.write(`[frontend] ${d}`);
      if (!frontendReady && (d.toString().includes("Local") || d.toString().includes("localhost"))) {
        frontendReady = true;
        if (backendReady) openWindow(`http://localhost:${FRONTEND_PORT}`);
      }
    });
    frontendProcess2.stderr?.on("data", (d) => process.stderr.write(`[frontend] ${d}`));

    // 超时兜底：10秒后无论是否就绪都尝试打开
    setTimeout(() => {
      if (!backendReady || !frontendReady) {
        openWindow(`http://localhost:${FRONTEND_PORT}`);
      }
    }, 15000);
  } else {
    // 生产模式：启动内置服务器
    backendProcess = startBackend();
    frontendServer = startFrontend();

    // 等待后端就绪后打开窗口
    try {
      await waitForServer(`http://localhost:${BACKEND_PORT}/api/chat`);
      openWindow(`http://localhost:${FRONTEND_PORT}`);
    } catch (e) {
      console.error("Failed to start servers:", e);
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (frontendServer) frontendServer?.close();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (backendProcess) backendProcess.kill();
  if (frontendServer) frontendServer?.close();
});
