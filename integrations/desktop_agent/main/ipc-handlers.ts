/**
 * IPC handlers — bridge between the renderer (wizard / settings UI)
 * and the main process (proxy, keychain, cert install, OS proxy settings).
 */

import { ipcMain } from "electron";
import { saveCredentials, loadCredentials, clearCredentials } from "./keychain";
import { startProxy, stopProxy, getStatus, getThreatCount } from "./proxy-manager";
import { generateCaCert } from "./proxy-manager";
import { isCertTrusted, installCert, getCertPath } from "./cert-manager";
import { enableSystemProxy, disableSystemProxy } from "./proxy-settings";

export type LoginPayload = {
  apiBaseUrl: string;
  username: string;
  password: string;
};

export type LoginResult = { ok: true; employeeId: string } | { ok: false; error: string };

/** Validate that the given string is a safe https URL (http allowed only for localhost). */
function _validateApiBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Invalid API URL — must be a full http(s) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("API URL must use http or https");
  }
  const isLocalhost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.protocol === "http:" && !isLocalhost) {
    throw new Error("API URL must use HTTPS for non-localhost hosts");
  }
  return parsed.origin;
}

export function registerIpcHandlers(): void {
  // ---- Auth ----------------------------------------------------------------

  ipcMain.handle("sentinel:login", async (_e, payload: LoginPayload): Promise<LoginResult> => {
    try {
      const safeBase = _validateApiBaseUrl(payload.apiBaseUrl);
      const url = `${safeBase}/api/auth/login`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: payload.username, password: payload.password }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { ok: false, error: body || `HTTP ${res.status}` };
      }

      const data = (await res.json()) as { access_token: string; user: { employee_id: number | null } };
      const employeeId = String(data.user?.employee_id ?? "");

      await saveCredentials({
        accessToken: data.access_token,
        apiBaseUrl: safeBase,
        employeeId,
        password: payload.password,
      });

      return { ok: true, employeeId };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:logout", async (): Promise<void> => {
    await stopProxy();
    await disableSystemProxy().catch(() => {});
    await clearCredentials();
  });

  ipcMain.handle("sentinel:get-credentials", async () => {
    const { accessToken, apiBaseUrl, employeeId } = await loadCredentials();
    return { hasToken: Boolean(accessToken), apiBaseUrl, employeeId };
  });

  // ---- Status --------------------------------------------------------------

  ipcMain.handle("sentinel:get-status", () => ({
    status: getStatus(),
    threatCount: getThreatCount(),
  }));

  // ---- Proxy ---------------------------------------------------------------

  ipcMain.handle("sentinel:start-proxy", async () => {
    await startProxy();
    return getStatus();
  });

  ipcMain.handle("sentinel:stop-proxy", async () => {
    await stopProxy();
    return getStatus();
  });

  // ---- Certificate ---------------------------------------------------------

  ipcMain.handle("sentinel:generate-cert", async (): Promise<{ ok: boolean; certPath?: string; error?: string }> => {
    try {
      const certPath = await generateCaCert();
      return { ok: true, certPath };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:is-cert-trusted", async (): Promise<boolean> => {
    return isCertTrusted();
  });

  ipcMain.handle("sentinel:install-cert", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const certPath = getCertPath();
      await installCert(certPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  // ---- OS Proxy ------------------------------------------------------------

  ipcMain.handle("sentinel:enable-system-proxy", async (_e, port: number): Promise<{ ok: boolean; error?: string }> => {
    try {
      await enableSystemProxy(port);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });

  ipcMain.handle("sentinel:disable-system-proxy", async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      await disableSystemProxy();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
}
