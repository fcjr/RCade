import { generateTotp, TOTP_PARAMS } from "@rcade/api";
import { timingSafeEqualStrings } from "./compare";

// Accept the current and previous step (a code stays valid for up to ~60s after
// it appears, so slow typing is fine). Future steps are never accepted — that
// would only matter if the cabinet clock ran ahead of the server's, which the
// cabinet logs a skew warning for.
const ACCEPTED_STEP_OFFSETS = [-1, 0];

export async function verifyTotp(secretHex: string, code: string, nowMs: number): Promise<boolean> {
    if (!new RegExp(`^\\d{${TOTP_PARAMS.digits}}$`).test(code)) {
        return false;
    }

    const stepMs = TOTP_PARAMS.periodSeconds * 1000;

    // Evaluate every slot so timing doesn't reveal which one matched.
    let ok = false;
    for (const offset of ACCEPTED_STEP_OFFSETS) {
        const expected = await generateTotp(secretHex, nowMs + offset * stepMs);
        if (await timingSafeEqualStrings(expected, code)) {
            ok = true;
        }
    }
    return ok;
}
