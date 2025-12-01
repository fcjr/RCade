import type { WebPlugin } from "./manager";

const KEY_MAP: Record<string, { type: "button" | "system"; player: number; button: string }> = {
	// Player 1 - WASD + FG
	KeyW: { type: "button", player: 1, button: "UP" },
	KeyS: { type: "button", player: 1, button: "DOWN" },
	KeyA: { type: "button", player: 1, button: "LEFT" },
	KeyD: { type: "button", player: 1, button: "RIGHT" },
	KeyF: { type: "button", player: 1, button: "A" },
	KeyG: { type: "button", player: 1, button: "B" },
	// Player 2 - IJKL + ;'
	KeyI: { type: "button", player: 2, button: "UP" },
	KeyK: { type: "button", player: 2, button: "DOWN" },
	KeyJ: { type: "button", player: 2, button: "LEFT" },
	KeyL: { type: "button", player: 2, button: "RIGHT" },
	Semicolon: { type: "button", player: 2, button: "A" },
	Quote: { type: "button", player: 2, button: "B" },
	// System
	Digit1: { type: "system", player: 0, button: "ONE_PLAYER" },
	Digit2: { type: "system", player: 0, button: "TWO_PLAYER" },
};

export class InputWebPlugin implements WebPlugin {
	private port: MessagePort | null = null;
	private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
	private keyupHandler: ((e: KeyboardEvent) => void) | null = null;

	start(port: MessagePort): void {
		this.port = port;

		this.keydownHandler = (e) => {
			if (KEY_MAP[e.code]) {
				e.preventDefault();
				this.sendKey(e.code, true);
			}
		};

		this.keyupHandler = (e) => {
			if (KEY_MAP[e.code]) {
				e.preventDefault();
				this.sendKey(e.code, false);
			}
		};

		window.addEventListener("keydown", this.keydownHandler);
		window.addEventListener("keyup", this.keyupHandler);
	}

	stop(): void {
		if (this.keydownHandler) window.removeEventListener("keydown", this.keydownHandler);
		if (this.keyupHandler) window.removeEventListener("keyup", this.keyupHandler);
		this.keydownHandler = null;
		this.keyupHandler = null;
		this.port = null;
	}

	private sendKey(code: string, pressed: boolean): void {
		const mapping = KEY_MAP[code];
		if (mapping && this.port) {
			this.port.postMessage({ ...mapping, pressed });
		}
	}
}
