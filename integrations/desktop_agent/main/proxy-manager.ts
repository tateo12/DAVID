/**
 * Manages the lifecycle of the mitmproxy child process.
 *
 * Spawns mitmdump with sentinel_proxy_desktop.py, parses structured JSON
 * output lines to update app state, and handles crash recovery.
 */

import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { app } from "electron";
import { loadCredentials } from "./keychain";

export type ProxyStatus = "stopped" | "starting" | "running" | "error";

export type ProxyEvent = {
  event: "capture" | "error";
  risk?: string;
  host?: string;
  source_app?: string;
  shadow_ai?: boolean;
  detail?: string;
};

type EventCallback = (event: ProxyEvent) => void;

const PROXY_PORT = 9876;
const MAX_RESTARTS = 3;
const RESTART_DELAY_MS = 3000;

let child: ChildProcess | null = null;
let status: ProxyStatus = "stopped";
let restartCount = 0;
let threatCount = 0;
let eventCallbacks: EventCallback[] = [];

export function onProxyEvent(cb: EventCallback): void {
  eventCallbacks.push(cb);
}

export function getStatus(): ProxyStatus {
  return status;
}

export function getThreatCount(): number {
  return threatCount;
}

export function getProxyPort(): number {
  return PROXY_PORT;
}

/** Resolve the mitmdump binary — bundled binary first, then PATH fallback. */
function getMitmdumpPath(): string {
  const bundled = path.join(
    app.isPackaged ? process.resourcesPath : path.join(__dirname, ".."),
    "resources",
    "python",
    process.platform === "win32" ? "mitmdump.exe" : "mitmdump"
  );
  // In dev mode or if bundled binary missing, fall back to system mitmdump
  try {
    require("fs").accessSync(bundled);
    return bundled;
  } catch {
    return "mitmdump";
  }
}

function getAddonScriptPath(): string {
  const resourcesDir = app.isPackaged
    ? path.join(process.resourcesPath, "proxy")
    : path.join(__dirname, "..", "proxy");
  return path.join(resourcesDir, "sentinel_proxy_desktop.py");
}

function getCertDir(): string {
  return path.join(app.getPath("userData"), "mitmproxy");
}

function emitEvent(event: ProxyEvent): void {
  eventCallbacks.forEach((cb) => cb(event));
}

export async function startProxy(): Promise<void> {
  if (child !== null) return;

  const creds = await loadCredentials();
  status = "starting";

  const mitmdump = getMitmdumpPath();
  const addonScript = getAddonScriptPath();
  const certDir = getCertDir();

  // Write the token to a 0600 temp file so it's never visible in the process environment.
  const tokenFile = path.join(os.tmpdir(), `sentinel-token-${process.pid}.tmp`);
  fs.writeFileSync(tokenFile, creds.accessToken ?? "", { mode: 0o600 });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SENTINEL_API_URL: creds.apiBaseUrl ?? "http://localhost:8000",
    SENTINEL_TOKEN_FILE: tokenFile,
    SENTINEL_EMPLOYEE_ID: creds.employeeId ?? "",
    PYTHONUNBUFFERED: "1",
  };

  child = spawn(
    mitmdump,
    [
      "-s", addonScript,
      "--listen-port", String(PROXY_PORT),
      "--set", `confdir=${certDir}`,
      "--quiet",
    ],
    { env, stdio: ["ignore", "pipe", "pipe"] }
  );

  child.stdout?.on("data", (chunk: Buffer) => {
    const lines = chunk.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const event: ProxyEvent = JSON.parse(line);
        if (event.event === "capture" && event.risk && event.risk !== "low") {
          threatCount++;
        }
        emitEvent(event);
      } catch {
        // non-JSON line — ignore
      }
    }
  });

  child.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    // mitmdump writes startup messages to stderr; detect "Proxy server listening"
    if (text.includes("Proxy server listening")) {
      status = "running";
      restartCount = 0;
      emitEvent({ event: "capture", host: "proxy", source_app: "sentinel" });
    }
  });

  child.on("exit", (code) => {
    child = null;
    // Clean up token file regardless of exit reason
    try { fs.unlinkSync(tokenFile); } catch { /* already gone */ }
    if (status === "running" || status === "starting") {
      // Unexpected exit — attempt restart
      if (restartCount < MAX_RESTARTS) {
        restartCount++;
        status = "starting";
        setTimeout(() => void startProxy(), RESTART_DELAY_MS);
      } else {
        status = "error";
        emitEvent({ event: "error", detail: `Proxy exited (code=${code}) after ${MAX_RESTARTS} restarts` });
      }
    } else {
      status = "stopped";
    }
  });
}

export function stopProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (!child) {
      status = "stopped";
      resolve();
      return;
    }

    const proc = child;
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 5000);

    proc.on("exit", () => {
      clearTimeout(timer);
      child = null;
      status = "stopped";
      resolve();
    });

    proc.kill("SIGTERM");
  });
}

/** Start mitmdump in probe-only mode to generate the CA cert, then stop it. */
export function generateCaCert(): Promise<string> {
  return new Promise((resolve, reject) => {
    const certDir = getCertDir();
    const certPath = path.join(certDir, "mitmproxy-ca-cert.pem");

    const fs = require("fs") as typeof import("fs");
    if (fs.existsSync(certPath)) {
      resolve(certPath);
      return;
    }

    fs.mkdirSync(certDir, { recursive: true });

    const probe = spawn(
      getMitmdumpPath(),
      ["--listen-port", "19876", "--set", `confdir=${certDir}`, "--quiet"],
      { stdio: "ignore" }
    );

    // Give mitmdump ~2 seconds to generate the cert then kill it
    const timer = setTimeout(() => {
      probe.kill("SIGTERM");
      if (fs.existsSync(certPath)) {
        resolve(certPath);
      } else {
        reject(new Error("CA cert not generated"));
      }
    }, 2000);

    probe.on("exit", () => clearTimeout(timer));
  });
}
