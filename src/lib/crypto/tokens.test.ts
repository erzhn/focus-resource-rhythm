import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken } from "./tokens";

const key = randomBytes(32);

describe("шифрование токенов (AES-256-GCM)", () => {
  it("расшифровка возвращает исходный текст", () => {
    const secret = "refresh-token-abc-123";
    const enc = encryptToken(secret, key);
    expect(enc).not.toContain(secret); // зашифровано, не в открытом виде
    expect(decryptToken(enc, key)).toBe(secret);
  });

  it("каждый вызов даёт разный шифртекст (случайный IV)", () => {
    expect(encryptToken("x", key)).not.toBe(encryptToken("x", key));
  });

  it("подделанный тег приводит к ошибке (защита целостности)", () => {
    const enc = encryptToken("secret", key);
    const [iv, , data] = enc.split(".");
    const badTag = Buffer.from("0".repeat(16)).toString("base64");
    expect(() => decryptToken([iv, badTag, data].join("."), key)).toThrow();
  });
});
