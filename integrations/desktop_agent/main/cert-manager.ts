/**
 * CA certificate installation helpers.
 *
 * Detects whether the mitmproxy CA cert is already trusted and runs the
 * appropriate platform script to install it with elevated privileges.
 */

import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { app } from "electron";

const execFileAsync = promisify(execFile);

const _scriptsDir = path.join(__dirname, "..", "..", "scripts");

/** Reject paths that contain shell metacharacters to prevent command injection. */
function _assertSafePath(p: string): void {
  if (/[;&|`$<>!\n\r"']/.test(p)) {
    throw new Error(`Unsafe characters in path: ${p}`);
  }
}

export function getCertPath(): string {
  return path.join(app.getPath("userData"), "mitmproxy", "mitmproxy-ca-cert.pem");
}

/** Returns true if the Sentinel CA cert is already in the system trust store. */
export async function isCertTrusted(): Promise<boolean> {
  try {
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        `(Get-ChildItem Cert:\\LocalMachine\\Root | Where-Object { $_.Subject -like '*mitmproxy*' }).Count`,
      ]);
      return parseInt(stdout.trim(), 10) > 0;
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync("security", [
        "find-certificate",
        "-c",
        "mitmproxy",
        "/Library/Keychains/System.keychain",
      ]);
      return stdout.trim().length > 0;
    }
    // Linux: check if the cert file exists in the system CA dir
    const fs = require("fs") as typeof import("fs");
    return fs.existsSync("/usr/local/share/ca-certificates/sentinel-mitmproxy.crt");
  } catch {
    return false;
  }
}

/**
 * Install the CA cert with elevated privileges.
 * Uses sudo-prompt on macOS/Linux, and a UAC-elevated PowerShell on Windows.
 */
export async function installCert(certPath: string): Promise<void> {
  if (process.platform === "win32") {
    await _installCertWindows(certPath);
  } else if (process.platform === "darwin") {
    await _installCertMacos(certPath);
  } else {
    await _installCertLinux(certPath);
  }
}

async function _installCertWindows(certPath: string): Promise<void> {
  _assertSafePath(certPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sudo = require("sudo-prompt") as typeof import("sudo-prompt");
  const script = path.join(_scriptsDir, "install-cert-windows.ps1");
  _assertSafePath(script);

  await new Promise<void>((resolve, reject) => {
    sudo.exec(
      `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${script}" -CertPath "${certPath}"`,
      { name: "Sentinel Desktop Agent" },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function _installCertMacos(certPath: string): Promise<void> {
  _assertSafePath(certPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sudo = require("sudo-prompt") as typeof import("sudo-prompt");

  await new Promise<void>((resolve, reject) => {
    sudo.exec(
      `security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain "${certPath}"`,
      { name: "Sentinel Desktop Agent" },
      (err) => (err ? reject(err) : resolve())
    );
  });
}

async function _installCertLinux(certPath: string): Promise<void> {
  _assertSafePath(certPath);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sudo = require("sudo-prompt") as typeof import("sudo-prompt");

  await new Promise<void>((resolve, reject) => {
    sudo.exec(
      `cp "${certPath}" /usr/local/share/ca-certificates/sentinel-mitmproxy.crt && update-ca-certificates`,
      { name: "Sentinel Desktop Agent" },
      (err) => (err ? reject(err) : resolve())
    );
  });
}
