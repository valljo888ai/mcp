import { randomUUID } from "node:crypto";

let _sessionToken: string | null = null;

export function initSession(): string {
  _sessionToken = randomUUID();
  return _sessionToken;
}

export function getSessionToken(): string | null {
  return _sessionToken;
}

export function isSessionInitialized(): boolean {
  return _sessionToken !== null;
}
