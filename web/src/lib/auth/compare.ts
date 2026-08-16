// Constant-time string equality that works in both workerd and Node (vite dev).
// Hashing first fixes the compared length at 32 bytes regardless of input lengths,
// so neither content nor length leaks through timing.
export async function timingSafeEqualStrings(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const [hashA, hashB] = await Promise.all([
        globalThis.crypto.subtle.digest("SHA-256", encoder.encode(a)),
        globalThis.crypto.subtle.digest("SHA-256", encoder.encode(b)),
    ]);

    const bytesA = new Uint8Array(hashA);
    const bytesB = new Uint8Array(hashB);

    let diff = 0;
    for (let i = 0; i < bytesA.length; i++) {
        diff |= bytesA[i] ^ bytesB[i];
    }
    return diff === 0;
}
