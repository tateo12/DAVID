/**
 * Preload script — exposes a safe IPC bridge to the renderer via contextBridge.
 * The renderer never gets direct access to Node.js APIs.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("sentinel", {
  login: (payload: { apiBaseUrl: string; username: string; password: string }) =>
    ipcRenderer.invoke("sentinel:login", payload),

  logout: () => ipcRenderer.invoke("sentinel:logout"),

  getCredentials: () => ipcRenderer.invoke("sentinel:get-credentials"),

  getStatus: () => ipcRenderer.invoke("sentinel:get-status"),

  startProxy: () => ipcRenderer.invoke("sentinel:start-proxy"),

  stopProxy: () => ipcRenderer.invoke("sentinel:stop-proxy"),

  generateCert: () => ipcRenderer.invoke("sentinel:generate-cert"),

  isCertTrusted: () => ipcRenderer.invoke("sentinel:is-cert-trusted"),

  installCert: () => ipcRenderer.invoke("sentinel:install-cert"),

  enableSystemProxy: (port: number) => ipcRenderer.invoke("sentinel:enable-system-proxy", port),

  disableSystemProxy: () => ipcRenderer.invoke("sentinel:disable-system-proxy"),
});
