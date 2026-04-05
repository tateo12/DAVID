/**
 * Sentinel Desktop Agent — Main Process Entry Point
 *
 * Lifecycle:
 *  1. Enforce single instance
 *  2. If no stored credentials → show app (login view)
 *  3. Otherwise → show app (dashboard view) + start proxy
 *  4. On quit → stop proxy + disable OS proxy
 */

import { app } from "electron";
import { hasValidSession } from "./keychain";
import { startProxy, stopProxy, onProxyEvent } from "./proxy-manager";
import { disableSystemProxy, enableSystemProxy } from "./proxy-settings";
import { createTray, updateTrayStatus } from "./tray";
import { registerIpcHandlers } from "./ipc-handlers";
import { getProxyPort } from "./proxy-manager";
import { openAppWindow, getAppWindow } from "./window-manager";

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  const win = getAppWindow();
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // Show dock icon in dev mode so the window is easily accessible
  // if (process.platform === "darwin") app.dock.hide();

  // Register IPC handlers before any window opens
  registerIpcHandlers();

  // Create the tray
  createTray();

  const hasSession = await hasValidSession();

  // Always open the app window — it handles login vs dashboard internally
  openAppWindow();

  if (hasSession) {
    // Existing session — start monitoring silently
    await _startMonitoring();
  }
});

app.on("window-all-closed", () => {
  // Keep running in the background (tray); do NOT quit when all windows close
});

app.on("before-quit", async () => {
  await stopProxy();
  await disableSystemProxy().catch(() => {});
});

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

async function _startMonitoring(): Promise<void> {
  try {
    await enableSystemProxy(getProxyPort());
  } catch {
    // Non-fatal — proxy still works if OS proxy setting fails
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
