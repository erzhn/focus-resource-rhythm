import { createHash, randomBytes } from "node:crypto";

/** PKCE + state для безопасного OAuth (ТЗ §20). */

const base64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createState(): string {
  return base64url(randomBytes(24));
}

export function createCodeVerifier(): string {
  return base64url(randomBytes(32));
}

export function codeChallengeFromVerifier(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}
