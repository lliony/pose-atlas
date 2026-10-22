/**
 * 云端备份的端到端加密：备份码经 PBKDF2 派生成 AES-GCM 密钥，
 * 服务器只保存密文，拿不到卡片内容。
 */
export type SealedBackup = {
  v: 1;
  salt: string;
  iv: string;
  data: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 150000;

function toBase64(bytes: Uint8Array): string {
  let text = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    text += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(text);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(code),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealBackup(
  code: string,
  json: string,
): Promise<SealedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(code, salt);
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encoder.encode(json),
  );
  return {
    v: 1,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(sealed)),
  };
}

export async function openBackup(
  code: string,
  sealed: SealedBackup,
): Promise<string> {
  if (!sealed || sealed.v !== 1 || !sealed.salt || !sealed.iv || !sealed.data)
    throw new Error("云端备份格式不受支持");
  const key = await deriveKey(code, fromBase64(sealed.salt));
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(sealed.iv) as unknown as BufferSource },
      key,
      fromBase64(sealed.data) as unknown as BufferSource,
    );
    return decoder.decode(plain);
  } catch {
    throw new Error("备份码不正确，或者云端备份已损坏");
  }
}

/** 生成 22 位的备份码（只用 URL 安全字符）。 */
export function newBackupCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return toBase64(bytes)
    .replace(/[+/=]/g, "")
    .slice(0, 22);
}
