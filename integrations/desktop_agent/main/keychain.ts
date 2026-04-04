/**
 * Secure credential storage using Electron's safeStorage API + a local JSON file.
 * safeStorage encrypts/decrypts using the OS credential store (DPAPI on Windows,
 * Keychain on macOS, libsecret on Linux) — no native addon needed.
 */

import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

function getCredsFile(): string {
  return path.join(app.getPath("userData"), "sentinel-creds.enc.json");
}

export type StoredCredentials = {
  accessToken: string;
  apiBaseUrl: string;
  employeeId: string;
  userId: string;
  username: string;
  email: string;
  role: string;
  orgId: string;
};

function _encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(value).toString("base64");
  return safeStorage.encryptString(value).toString("base64");
}

function _decrypt(encoded: string): string {
  if (!safeStorage.isEncryptionAvailable()) return Buffer.from(encoded, "base64").toString("utf-8");
  return safeStorage.decryptString(Buffer.from(encoded, "base64"));
}

function _readStore(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getCredsFile(), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function _writeStore(store: Record<string, string>): void {
  fs.mkdirSync(path.dirname(getCredsFile()), { recursive: true });
  fs.writeFileSync(getCredsFile(), JSON.stringify(store), { mode: 0o600 });
}

export async function saveCredentials(creds: Partial<StoredCredentials>): Promise<void> {
  const store = _readStore();
  for (const [key, value] of Object.entries(creds)) {
    if (value !== undefined) store[key] = _encrypt(value);
  }
  _writeStore(store);
}

export async function loadCredentials(): Promise<Partial<StoredCredentials>> {
  const store = _readStore();
  const result: Partial<StoredCredentials> = {};
  for (const [key, encoded] of Object.entries(store)) {
    try {
      (result as Record<string, string>)[key] = _decrypt(encoded);
    } catch {
      // corrupted entry — skip
    }
  }
  return result;
}

export async function clearCredentials(): Promise<void> {
  try {
    fs.unlinkSync(getCredsFile());
  } catch {
    // file doesn't exist — fine
  }
}

export async function hasValidSession(): Promise<boolean> {
  const creds = await loadCredentials();
  return Boolean(creds.accessToken && creds.accessToken.length > 0);
}
