// RFC 6238 TOTP over WebCrypto. This module must stay portable across
// Cloudflare Workers, browsers, Electron main, and Node — use only
// globalThis.crypto, never node:crypto.

export const TOTP_PARAMS = { digits: 6, periodSeconds: 30 } as const;

export type TotpParams = { digits: number; periodSeconds: number };

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0 || /[^0-9a-fA-F]/.test(hex)) {
    throw new Error("TOTP secret must be a hex string");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function generateTotp(
  secretHex: string,
  timeMs: number,
  opts: TotpParams = TOTP_PARAMS,
): Promise<string> {
  const counter = Math.floor(timeMs / 1000 / opts.periodSeconds);

  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));

  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    hexToBytes(secretHex),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hmac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", key, message));

  // Dynamic truncation (RFC 4226 §5.3)
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];

  return (binCode % 10 ** opts.digits).toString().padStart(opts.digits, "0");
}
