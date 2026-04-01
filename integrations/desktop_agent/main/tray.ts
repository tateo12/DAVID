/**
 * System tray icon and context menu.
 *
 * Icon variants:
 *   idle    — proxy not running
 *   active  — proxy running, no recent threats
 *   warning — proxy running, threats detected
 */

import { Tray, Menu, nativeImage, app, BrowserWindow, shell } from "electron";
import path from "path";
import { getStatus, getThreatCount, getProxyPort, startProxy, stopProxy } from "./proxy-manager";

let tray: Tray | null = null;
let settingsWindow: BrowserWindow | null = null;

const _assetsDir = path.join(__dirname, "..", "assets");

function _icon(variant: "idle" | "active" | "warning"): Electron.NativeImage {
  const file = {
    idle: "tray-icon.png",
    active: "tray-icon-active.png",
    warning: "tray-icon-warning.png",
  }[variant];
  const iconPath = path.join(_assetsDir, file);
  const img = nativeImage.createFromPath(iconPath);
  // Resize to 16x16 (Windows) / 22x22 (macOS)
  return process.platform === "darwin" ? img.resize({ width: 22 }) : img.resize({ width: 16 });
}

export function createTray(): void {
  tray = new Tray(_icon("idle"));
  tray.setToolTip("Sentinel Desktop Agent");
  _updateContextMenu();
}

export function updateTrayStatus(): void {
  if (!tray) return;
  const status = getStatus();
  const threats = getThreatCount();

  if (status === "running" && threats > 0) {
    tray.setImage(_icon("warning"));
    tray.setToolTip(`Sentinel — ${threats} threat${threats === 1 ? "" : "s"} detected`);
  } else if (status === "running") {
    tray.setImage(_icon("active"));
    tray.setToolTip("Sentinel — Monitoring active");
  } else if (status === "error") {
    tray.setImage(_icon("warning"));
    tray.setToolTip("Sentinel — Proxy error");
  } else {
    tray.setImage(_icon("idle"));
    tray.setToolTip("Sentinel — Monitoring paused");
  }

  _updateContextMenu();
}

function _updateContextMenu(): void {
  if (!tray) return;
  const status = getStatus();
  const threats = getThreatCount();
  const port = getProxyPort();

  const statusLabel =
    status === "running"
      ? `● Active  |  Port ${port}  |  ${threats} threats`
      : status === "starting"
      ? "○ Starting…"
      : status === "error"
      ? "⚠ Error — check logs"
      : "○ Paused";

  const menu = Menu.buildFromTemplate([
    {
      label: statusLabel,
      enabled: false,
    },
    { type: "separator" },
    {
      label: status === "running" ? "Pause Monitoring" : "Resume Monitoring",
      click: async () => {
        if (status === "running") {
          await stopProxy();
        } else {
          await startProxy();
        }
        updateTrayStatus();
      },
    },
    { type: "separator" },
    {
      label: "Open Dashboard",
      click: () => {
        // Open the Sentinel web dashboard in the default browser
        shell.openExternal("http://localhost:3000").catch(() => {});
      },
    },
    {
      label: "Settings",
      click: () => _openSettingsWindow(),
    },
    { type: "separator" },
    {
      label: "Quit Sentinel",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(menu);
}

function _openSettingsWindow(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 520,
    height: 480,
    title: "Sentinel Settings",
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  settingsWindow.loadFile(path.join(__dirname, "..", "renderer", "settings.html"));
  settingsWindow.on("closed", () => { settingsWindow = null; });
}
