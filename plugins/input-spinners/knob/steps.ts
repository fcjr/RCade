import { TURN } from "./protocol.ts";

/** The old spinners' steps per turn, which v1 games count in. */
export const STEPS_PER_TURN = 64;
const UNITS_PER_STEP = TURN / STEPS_PER_TURN;

/** Turns a spinner's global angle into whole steps, keeping the remainder
 *  so slow turning still adds up. */
export class StepCounter {
    private last?: number;
    private remainder = 0;

    /** Steps since the last angle. The first angle, or one after `forget`,
     *  only sets where counting starts. */
    take(globalAngle: number): number {
        const moved = this.last === undefined ? 0 : globalAngle - this.last;
        this.last = globalAngle;
        this.remainder += moved;
        const steps = Math.trunc(this.remainder / UNITS_PER_STEP);
        this.remainder -= steps * UNITS_PER_STEP;
        return steps;
    }

    /** The spinner restarted or changed: its angle jumped, but it didn't turn. */
    forget(): void {
        this.last = undefined;
        this.remainder = 0;
    }
}
