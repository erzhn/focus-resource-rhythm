import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Шифрование OAuth refresh-токенов перед сохранением в БД (AES-256-GCM).
 * Ключ берётся из TOKEN_ENCRYPTION_KEY (base64, 32 байта) и живёт только на сервере.
 * Токены никогда не отдаются клиенту и не пишутся в логи.
 */

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY не задан");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY должен быть 32 байта (base64)");
  return key;
}

/** Шифрует строку. Возвращает строку формата iv.tag.ciphertext (base64). */
export function encryptToken(plaintext: string, key: Buffer = getKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

/** Расшифровывает строку, полученную из encryptToken. */
export function decryptToken(payload: string, key: Buffer = getKey()): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Некорректный формат зашифрованного токена");
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Утилита для генерации ключа (для документации/.env). */
export function generateEncryptionKeyBase64(): string {
  return randomBytes(32).toString("base64");
}
