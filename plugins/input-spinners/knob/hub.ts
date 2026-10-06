import type { Player, WireCommand } from "../clients/typescript/index.ts";
import { HidSpinner, type HidAccess } from "./hid.ts";
import type { DeviceMessage, PlayerMessage } from "./protocol.ts";
import { TKnob, type SerialConnection } from "./tknob.ts";

export interface SerialAccess {
    paths(): Promise<string[]>;
    open(path: string): Promise<SerialConnection>;
}

/** Which knob is which player: knob IDs (the `id` in hello) that must be P1
 *  or P2. Any other knob takes the lowest free player. */
export interface Seats {
    p1?: string;
    p2?: string;
}

export type Listener = (message: PlayerMessage) => void;

/** A plugin's hold on the knobs. */
export interface Attachment {
    /** A game's command, already checked. Replies come to this listener. */
    send(command: WireCommand): void;
    /** Let go. The last to let go closes the knobs. */
    detach(): Promise<void>;
}

/** How often to look for knobs that aren't connected yet. */
const DISCOVER_INTERVAL_MS = 1_000;
const PLAYERS: Player[] = [1, 2];

/**
 * The cabinet's one connection to the spinners, shared by every plugin that
 * uses them: the menu and a game each attach, through whichever plugin
 * version they asked for. Everyone hears every knob; only the newest
 * attachment (the game in front) may change how they feel. A newcomer finds
 * them fresh: the stock feel, stopped, at 0. When the one in front leaves,
 * the knobs are reset and braked for whoever is next.
 */
export class KnobHub {
    private attachments: Listener[] = [];
    private seats = new Map<Player, TKnob>();
    private opening = new Set<string>();
    /** Why the last search for knobs came up short. */
    private failure = "Looking for T-Knob";
    private generation = 0;
    private timer?: ReturnType<typeof setTimeout>;
    private closing: Promise<void> = Promise.resolve();
    /** Knobs waiting on `fresh`'s tare, and what to announce them with. */
    private settling = new Map<Player, string | undefined>();
    // TEMPORARY: the old HID spinners stand in for missing knobs.
    private hid?: { close(): void };
    private hidSpinners = new Map<Player, HidSpinner>(PLAYERS.map(player => [player, new HidSpinner(player)]));

    constructor(private serial: SerialAccess, private options: { seats?: Seats; hid?: HidAccess } = {}) {}

    attach(listener: Listener): Attachment {
        this.attachments.push(listener);
        if (this.attachments.length === 1) {
            const generation = this.generation;
            void this.closing.then(() => this.discover(generation));
        } else {
            for (const player of PLAYERS) this.fresh(player);
        }
        for (const player of PLAYERS) this.announce(player, listener);
        return { send: command => this.command(listener, command), detach: () => this.detach(listener) };
    }

    private get owner(): Listener | undefined {
        return this.attachments[this.attachments.length - 1];
    }

    private source(player: Player): TKnob | HidSpinner | undefined {
        return this.seats.get(player) ?? (this.hid ? this.hidSpinners.get(player) : undefined);
    }

    /** Tell a listener what's at this player now. */
    private announce(player: Player, listener: Listener, message?: string): void {
        const source = this.source(player);
        if (source?.identity) {
            listener({ ...source.identity, player });
            listener({ type: "connection", player, connected: true, message: message ?? "Connected" });
        } else {
            listener({ type: "connection", player, connected: false, message: message ?? this.failure });
        }
    }

    private broadcast(message: PlayerMessage): void {
        for (const listener of [...this.attachments]) listener(message);
    }

    /** Stock feel, stopped, at 0. Ticks before the tare's ack would read as
     *  a turn, so they're dropped, then the knob is announced anew. */
    private fresh(player: Player, message?: string): void {
        const knob = this.seats.get(player);
        if (!knob) {
            this.hidSpinners.get(player)!.handle({ type: "tare", global_angle: 0 });
            return this.refresh(player, message);
        }
        knob.send({ type: "reset" });
        knob.send({ type: "brake" });
        knob.send({ type: "tare", global_angle: 0 });
        this.settling.set(player, message);
    }

    /** A knob said something. Replies to commands go to whoever is in front. */
    private publish(player: Player, message: DeviceMessage): void {
        if (this.settling.has(player)) {
            if (message.type === "tick") return;
            // Ours is the tare without an id.
            if (message.type === "ack" && message.command === "tare" && message.id === undefined) {
                const announcement = this.settling.get(player);
                this.settling.delete(player);
                return this.refresh(player, announcement);
            }
        }
        const reply = (message.type === "ack" || message.type === "error") && message.id !== undefined;
        if (reply) this.owner?.({ ...message, player });
        else this.broadcast({ ...message, player });
    }

    private command(listener: Listener, command: WireCommand): void {
        const { player, id } = command;
        if (command.type === "hello") return this.announce(player, listener);
        if (listener !== this.owner) {
            return listener({ type: "error", player, id, message: "Another game has the spinners" });
        }
        const source = this.source(player);
        if (!source) return listener({ type: "error", player, id, message: `P${player} T-Knob not connected; ${command.type} was not sent` });
        const { player: _, ...device } = command;
        if (source instanceof HidSpinner) return listener({ ...source.handle(device), player });
        if (!source.send(device)) listener({ type: "error", player, id, message: "Spinner command queue is full, or the command is too big" });
    }

    private detach(listener: Listener): Promise<void> {
        const index = this.attachments.indexOf(listener);
        if (index === -1) return this.closing;
        const wasOwner = index === this.attachments.length - 1;
        this.attachments.splice(index, 1);
        if (this.attachments.length > 0) {
            // The game in front left: drop its curves and stop the knobs.
            if (wasOwner) for (const knob of this.seats.values()) { knob.send({ type: "reset" }); knob.send({ type: "brake" }); }
            return Promise.resolve();
        }
        // Nobody left: close everything.
        this.generation++;
        clearTimeout(this.timer);
        this.hid?.close();
        this.hid = undefined;
        const knobs = [...this.seats.values()];
        this.seats.clear();
        this.closing = this.closing.then(() => Promise.all(knobs.map(knob => knob.close(true)))).then(() => {});
        return this.closing;
    }

    private live(generation: number): boolean {
        return generation === this.generation && this.attachments.length > 0;
    }

    /** Look for knobs until every player has one, then keep looking for a
     *  knob that's unplugged and plugged back in. */
    private async discover(generation: number): Promise<void> {
        if (!this.live(generation)) return;
        try {
            this.openHid();
        } catch (error) {
            // The old spinner is a stand-in: it must never stop the search for knobs.
            console.error("[input-spinners] HID spinner:", error);
        }
        const before = this.failure;
        if (this.seats.size < PLAYERS.length) {
            try {
                for (const path of await this.serial.paths()) {
                    if (!this.live(generation) || this.seats.size >= PLAYERS.length) break;
                    if (this.opening.has(path) || [...this.seats.values()].some(knob => knob.path === path)) continue;
                    await this.connect(path, generation);
                }
            } catch (error) {
                this.failure = error instanceof Error ? error.message : String(error);
            }
        }
        if (!this.live(generation)) return;
        if (this.failure !== before) {
            for (const player of PLAYERS) if (!this.source(player)) this.refresh(player);
        }
        this.timer = setTimeout(() => void this.discover(generation), DISCOVER_INTERVAL_MS);
    }

    private async connect(path: string, generation: number): Promise<void> {
        this.opening.add(path);
        try {
            const knob = new TKnob(path, await this.serial.open(path));
            const hello = await knob.ready;
            const player = this.live(generation) ? this.seat(hello.id) : undefined;
            if (!player) {
                await knob.close(false);
                return;
            }
            this.seats.set(player, knob);
            knob.listen({
                message: message => this.publish(player, message),
                lost: error => this.lose(player, knob, error),
            });
            // After a cabinet restart, it may still have an old game's curves.
            this.fresh(player, `Connected to ${path}`);
        } catch (error) {
            this.failure = error instanceof Error ? error.message : String(error);
        } finally {
            this.opening.delete(path);
        }
    }

    /** The player for a knob that just said hello, or none if both are taken. */
    private seat(id: string): Player | undefined {
        const { p1, p2 } = this.options.seats ?? {};
        const reserved = id === p1 ? 1 : id === p2 ? 2 : undefined;
        if (reserved) return this.seats.has(reserved) ? undefined : reserved;
        const free = PLAYERS.filter(player => !this.seats.has(player));
        // Leave a seat that's reserved for another knob until it shows up.
        const open = free.filter(player => (player === 1 ? p1 : p2) === undefined);
        return open[0] ?? free[0];
    }

    private lose(player: Player, knob: TKnob, error: Error): void {
        if (this.seats.get(player) !== knob) return;
        this.seats.delete(player);
        this.settling.delete(player);
        this.broadcast({ type: "connection", player, connected: false, message: error.message });
        if (this.source(player)) this.refresh(player);
    }

    private refresh(player: Player, message?: string): void {
        for (const listener of [...this.attachments]) this.announce(player, listener, message);
    }

    // TEMPORARY: the old HID spinners.
    private openHid(): void {
        if (this.hid || !this.options.hid) return;
        this.hid = this.options.hid.open(steps => {
            PLAYERS.forEach((player, index) => {
                if (steps[index] === 0 || this.seats.has(player)) return;
                this.publish(player, this.hidSpinners.get(player)!.turn(steps[index]));
            });
        }, () => {
            this.hid = undefined;
            for (const player of PLAYERS) if (!this.seats.has(player)) this.refresh(player);
        });
        if (this.hid) for (const player of PLAYERS) if (!this.seats.has(player)) this.refresh(player);
    }
}
