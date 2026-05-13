import {
    PLAYER_1 as P1_CLASSIC,
    PLAYER_2 as P2_CLASSIC,
    SYSTEM,
} from "@rcade/plugin-input-classic";

import {
    PLAYER_1 as P1_SPINNERS,
    PLAYER_2 as P2_SPINNERS,
} from "@rcade/plugin-input-spinners";

(window as any).RCadeInput = {
    classic: {
        p1: P1_CLASSIC,
        p2: P2_CLASSIC,
        system: SYSTEM,
    },
    spinners: {
        p1: P1_SPINNERS,
        p2: P2_SPINNERS,
    },
};
