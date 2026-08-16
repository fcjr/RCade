import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTotp, TOTP_PARAMS } from "../dist/index.js";

// RFC 6238 Appendix B test vectors (SHA-1). Secret is the ASCII string
// "12345678901234567890" as hex; vectors are 8 digits, 30s period.
const RFC_SECRET_HEX = "3132333435363738393031323334353637383930";
const RFC_PARAMS = { digits: 8, periodSeconds: 30 };
const RFC_VECTORS = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"],
];

test("RFC 6238 SHA-1 test vectors", async () => {
  for (const [timeSeconds, expected] of RFC_VECTORS) {
    const code = await generateTotp(RFC_SECRET_HEX, timeSeconds * 1000, RFC_PARAMS);
    assert.equal(code, expected, `T=${timeSeconds}`);
  }
});

test("default params are 6 digits / 30s", () => {
  assert.deepEqual(TOTP_PARAMS, { digits: 6, periodSeconds: 30 });
});

test("6-digit codes match the RFC vectors truncated to 6 digits", async () => {
  for (const [timeSeconds, expected] of RFC_VECTORS) {
    const code = await generateTotp(RFC_SECRET_HEX, timeSeconds * 1000);
    assert.equal(code, expected.slice(-6), `T=${timeSeconds}`);
  }
});

test("code is stable within a period and changes across the boundary", async () => {
  const base = 1_700_000_010_000; // 10s into a 30s period
  assert.equal(
    await generateTotp(RFC_SECRET_HEX, base),
    await generateTotp(RFC_SECRET_HEX, base + 19_999),
  );
  assert.notEqual(
    await generateTotp(RFC_SECRET_HEX, base),
    await generateTotp(RFC_SECRET_HEX, base + 30_000),
  );
});

test("rejects non-hex secrets", async () => {
  await assert.rejects(() => generateTotp("not-hex!", 0));
  await assert.rejects(() => generateTotp("abc", 0)); // odd length
});
