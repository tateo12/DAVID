/**
 * App window manager — extracted to avoid circular dependency between
 * index.ts and tray.ts.
 */

import { BrowserWindow } from "electron";
import path from "path";

let appWindow: BrowserWindow | null = null;

export function openAppWindow(): void {
  if (appWindow && !appWindow.isDestroyed()) {
    appWindow.focus();
    return;
  }

  appWindow = new BrowserWindow({
    width: 1060,
    height: 700,
    minWidth: 800,
    minHeight: 540,
    title: "Sentinel Desktop",
    icon: path.join(__dirname, "..", "..", "assets", "icon.png"),
    backgroundColor: "#0d0f13",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  appWindow.loadFile(path.join(__dirname, "..", "..", "renderer", "app.html"));

  appWindow.on("closed", () => {
    appWindow = null;
  });
}

export function getAppWindow(): BrowserWindow | null {
  return appWindow;
}
