/**
 * Preload script — exposes a safe IPC bridge to the renderer via contextBridge.
 * The renderer never gets direct access to Node.js APIs.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sentinel", {
  // Auth
  login: (payload: { apiBaseUrl: string; email: string; password: string }) =>
    ipcRenderer.invoke("sentinel:login", payload),

  logout: () => ipcRenderer.invoke("sentinel:logout"),

  getCredentials: () => ipcRenderer.invoke("sentinel:get-credentials"),

  getUser: () => ipcRenderer.invoke("sentinel:get-user"),

  // Status
  getStatus: () => ipcRenderer.invoke("sentinel:get-status"),

  // Data
  fetchActivity: (limit?: number) => ipcRenderer.invoke("sentinel:fetch-activity", limit),

  fetchMetrics: () => ipcRenderer.invoke("sentinel:fetch-metrics"),

  // Proxy
  startProxy: () => ipcRenderer.invoke("sentinel:start-proxy"),

  stopProxy: () => ipcRenderer.invoke("sentinel:stop-proxy"),

  // Certificate
  generateCert: () => ipcRenderer.invoke("sentinel:generate-cert"),

  isCertTrusted: () => ipcRenderer.invoke("sentinel:is-cert-trusted"),

  installCert: () => ipcRenderer.invoke("sentinel:install-cert"),

  // OS Proxy
  enableSystemProxy: (port: number) => ipcRenderer.invoke("sentinel:enable-system-proxy", port),

  disableSystemProxy: () => ipcRenderer.invoke("sentinel:disable-system-proxy"),
});
