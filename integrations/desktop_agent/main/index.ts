/**
 * Sentinel Desktop Agent — Main Process Entry Point
 *
 * Lifecycle:
 *  1. Enforce single instance
 *  2. If no stored credentials → open setup wizard
 *  3. Otherwise → silent tray start + start proxy
 *  4. On quit → stop proxy + disable OS proxy
 */

import { app, BrowserWindow, protocol } from "electron";
import path from "path";
import { hasValidSession } from "./keychain";
import { startProxy, stopProxy, onProxyEvent } from "./proxy-manager";
import { disableSystemProxy, enableSystemProxy } from "./proxy-settings";
import { createTray, updateTrayStatus } from "./tray";
import { registerIpcHandlers } from "./ipc-handlers";
import { getProxyPort } from "./proxy-manager";

// Keep a reference so the wizard window doesn't get GC'd
let wizardWindow: BrowserWindow | null = null;

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  // If user tries to open a second instance, focus the wizard if open
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    if (wizardWindow.isMinimized()) wizardWindow.restore();
    wizardWindow.focus();
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Don't show a dock icon on macOS — tray only
  if (process.platform === "darwin") app.dock.hide();

  // Register IPC handlers before any window opens
  registerIpcHandlers();

  // Create the tray
  createTray();

  const hasSession = await hasValidSession();
  if (!hasSession) {
    openWizard();
    return;
  }

  // Existing session — start monitoring silently
  await _startMonitoring();
});

app.on("window-all-closed", () => {
  // Keep running in the background (tray); do NOT quit when all windows close
});

app.on("before-quit", async () => {
  await stopProxy();
  await disableSystemProxy().catch(() => {});
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function openWizard(): void {
  if (wizardWindow && !wizardWindow.isDestroyed()) {
    wizardWindow.focus();
    return;
  }

  wizardWindow = new BrowserWindow({
    width: 860,
    height: 620,
    title: "Sentinel Setup",
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  wizardWindow.loadFile(path.join(__dirname, "..", "renderer", "wizard.html"));

  wizardWindow.on("closed", async () => {
    wizardWindow = null;
    // If wizard was closed after completing setup, start monitoring
    const hasSession = await hasValidSession();
    if (hasSession) {
      await _startMonitoring();
    }
  });
}

async function _startMonitoring(): Promise<void> {
  try {
    await enableSystemProxy(getProxyPort());
  } catch {
    // Non-fatal — proxy still works if OS proxy setting fails (e.g. HTTPS_PROXY env var)
  }

  await startProxy();

  onProxyEvent((event) => {
    updateTrayStatus();
    if (event.event === "error") {
      // Could show a notification here
    }
  });

  updateTrayStatus();
}
