<script lang="ts" module>
	import { type PluginProvider } from '@rcade/engine';
	import semver from 'semver';

	type ButtonStates = {
		p1: {
			UP: boolean;
			DOWN: boolean;
			LEFT: boolean;
			RIGHT: boolean;
			A: boolean;
			B: boolean;
		};
		p2: {
			UP: boolean;
			DOWN: boolean;
			LEFT: boolean;
			RIGHT: boolean;
			A: boolean;
			B: boolean;
		};
		system: {
			ONE_PLAYER: boolean;
			TWO_PLAYER: boolean;
		};
	};

	export class InputClassicEmulator implements PluginProvider {
		constructor() {}

		private buttonStates: ButtonStates = {
			p1: {
				UP: false,
				DOWN: false,
				LEFT: false,
				RIGHT: false,
				A: false,
				B: false
			},
			p2: {
				UP: false,
				DOWN: false,
				LEFT: false,
				RIGHT: false,
				A: false,
				B: false
			},
			system: {
				ONE_PLAYER: false,
				TWO_PLAYER: false
			}
		};

		private currentChannel: MessagePort | null = null;

		getChannelName(): string {
			return '@rcade/input-classic';
		}

		getChannel(version: string): { channel: MessagePort; name: string; version: string } {
			// make sure version (e.g. `^1.0.0`) would match '1.0.0' (simple check for now)
			// use semver library
			if (!semver.satisfies('1.0.0', version)) {
				throw new Error(`Incompatible plugin version requested: ${version} (supported: 1.0.0)`);
			}

			const channel = new MessageChannel();
			this.currentChannel = channel.port1;

			// go over every button state and send down if pressed
			for (const player of ['p1', 'p2', 'system'] as const) {
				for (const button of Object.keys(this.buttonStates[player]) as Array<
					keyof ButtonStates['p1'] | keyof ButtonStates['p2'] | keyof ButtonStates['system']
				>) {
					const pressed = (this.buttonStates as any)[player][button as any];
					if (pressed) {
						this.currentChannel.postMessage({
							type: player === 'system' ? 'system' : 'button',
							player: player === 'system' ? 0 : player === 'p1' ? 1 : 2,
							button: button,
							pressed: pressed
						});
					}
				}
			}

			return {
				channel: channel.port2,
				name: this.getChannelName(),
				version: '1.0.0'
			};
		}

		updateButtonState(
			player: 'p1' | 'p2' | 'system',
			button: keyof ButtonStates['p1'] | keyof ButtonStates['p2'] | keyof ButtonStates['system'],
			pressed: boolean
		) {
			(this.buttonStates as any)[player][button as any] = pressed;

			// if there's a channel, send { type: "system" | "button", player: number, button: "ONE_PLAYER" | "A" | "UP" | etc.., pressed: boolean }
			if (this.currentChannel) {
				this.currentChannel.postMessage({
					type: player === 'system' ? 'system' : 'button',
					player: player === 'system' ? 0 : player === 'p1' ? 1 : 2,
					button: button,
					pressed: pressed
				});
			}
		}
	}
</script>

<script lang="ts">
	import DeckUnit from '$lib/component/DeckUnit.svelte';
	import Settings from './settings.svelte';

	interface Props {
		serialNo?: string;
		singlePlayer?: boolean;
		showKeybinds?: boolean;
		provider?: InputClassicEmulator;
	}

	function formatKeyDisplay(key: string) {
		if (!key) return '---';
		const map: Record<string, string> = {
			ArrowUp: '↑',
			ArrowDown: '↓',
			ArrowLeft: '←',
			ArrowRight: '→',
			' ': 'SPC',
			Enter: 'ENT',
			Escape: 'ESC',
			Control: 'CTRL',
			Shift: 'SHFT',
			Tab: 'TAB',
			Backspace: 'BKSP'
		};
		return map[key] || key.toUpperCase().slice(0, 4);
	}

	let {
		serialNo = '@rcade/input-classic',
		singlePlayer = false,
		showKeybinds = true,
		provider = $bindable(new InputClassicEmulator())
	} = $props();

	// Default to valid DOM key names (e.g. 'ArrowUp', 'Enter')
	const DEFAULT_BINDINGS = {
		p1: {
			up: 'w',
			left: 'a',
			down: 's',
			right: 'd',
			a: 'f',
			b: 'g',
			start: '1'
		},
		p2: {
			up: 'i',
			left: 'j',
			down: 'k',
			right: 'l',
			a: ';',
			b: "'",
			start: '2'
		}
	};

	let bindings = $state(DEFAULT_BINDINGS);
	let settingsOpen = $state(false);

	// Load from LocalStorage on mount (client-side)
	$effect(() => {
		const stored = localStorage.getItem('rcade-plugin-input-classic-bindings');
		if (stored) {
			try {
				bindings = JSON.parse(stored);
			} catch (e) {
				console.error('Failed to load bindings:', e);
			}
		}
	});

	function saveBindings(newBindings: typeof DEFAULT_BINDINGS) {
		bindings = newBindings;
		localStorage.setItem('rcade-plugin-input-classic-bindings', JSON.stringify(newBindings));
	}

	const STATE_P1_UP = $state({ v: false });
	const STATE_P1_DOWN = $state({ v: false });
	const STATE_P1_LEFT = $state({ v: false });
	const STATE_P1_RIGHT = $state({ v: false });
	const STATE_P1_A = $state({ v: false });
	const STATE_P1_B = $state({ v: false });
	const STATE_P2_UP = $state({ v: false });
	const STATE_P2_DOWN = $state({ v: false });
	const STATE_P2_LEFT = $state({ v: false });
	const STATE_P2_RIGHT = $state({ v: false });
	const STATE_P2_A = $state({ v: false });
	const STATE_P2_B = $state({ v: false });
	const STATE_SYS_ONE_PLAYER = $state({ v: false });
	const STATE_SYS_TWO_PLAYER = $state({ v: false });

	function handlePlayerPress(
		player: 'p1' | 'p2',
		action: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'A' | 'B',
		state: 'PRESS' | 'RELEASE'
	) {
		const stateVar =
			player === 'p1'
				? action === 'UP'
					? STATE_P1_UP
					: action === 'DOWN'
						? STATE_P1_DOWN
						: action === 'LEFT'
							? STATE_P1_LEFT
							: action === 'RIGHT'
								? STATE_P1_RIGHT
								: action === 'A'
									? STATE_P1_A
									: STATE_P1_B
				: action === 'UP'
					? STATE_P2_UP
					: action === 'DOWN'
						? STATE_P2_DOWN
						: action === 'LEFT'
							? STATE_P2_LEFT
							: action === 'RIGHT'
								? STATE_P2_RIGHT
								: action === 'A'
									? STATE_P2_A
									: STATE_P2_B;

		if (stateVar === undefined) return;
		if (stateVar.v === (state === 'PRESS')) return; // No change

		stateVar.v = state === 'PRESS';

		provider.updateButtonState(player, action, state === 'PRESS');
	}

	function handleSystemPress(action: 'ONE_PLAYER' | 'TWO_PLAYER', state: 'PRESS' | 'RELEASE') {
		let stateVar = action === 'ONE_PLAYER' ? STATE_SYS_ONE_PLAYER : STATE_SYS_TWO_PLAYER;

		if (stateVar === undefined) return;
		if (stateVar.v === (state === 'PRESS')) return; // No change

		stateVar.v = state === 'PRESS';

		provider.updateButtonState('system', action, state === 'PRESS');
	}

	function handleKeyPress(e: KeyboardEvent, state: 'PRESS' | 'RELEASE') {
		// Check Player 1 bindings
		for (const [action, key] of Object.entries(bindings.p1)) {
			if (e.key === key) {
				if (action === 'start') {
					handleSystemPress('ONE_PLAYER', state);
					return true;
				}

				handlePlayerPress('p1', action.toUpperCase() as any, state);
				return true;
			}
		}

		// Check Player 2 bindings
		for (const [action, key] of Object.entries(bindings.p2)) {
			if (e.key === key) {
				if (action === 'start') {
					handleSystemPress('TWO_PLAYER', state);
					return true;
				}

				handlePlayerPress('p2', action.toUpperCase() as any, state);
				return true;
			}
		}

		return false;
	}
</script>

<svelte:window
	on:keydown={(e) => {
		// Prevent default browser actions when keybinds are shown
		if (showKeybinds && handleKeyPress(e, 'PRESS')) {
			e.preventDefault();
		}
	}}
	on:keyup={(e) => {
		// Prevent default browser actions when keybinds are shown
		if (showKeybinds && handleKeyPress(e, 'RELEASE')) {
			e.preventDefault();
		}
	}}
/>
<DeckUnit {serialNo}>
	<Settings
		{bindings}
		onClose={() => {
			settingsOpen = false;
		}}
		onSave={saveBindings}
		open={settingsOpen}
	/>

	<div class="dark-deck">
		<div class="system-strip">
			<div class="sys-group left">
				<span class="sys-label">SETTINGS</span>
				<button
					class="btn-sys round"
					title="Settings"
					onclick={() => {
						settingsOpen = true;
					}}
				>
					<div class="icon-cog"></div>
				</button>
			</div>

			<div class="sys-group right">
				<div class="status-light off"></div>
				<span class="sys-label">CONNECTED</span>
			</div>
		</div>

		<div class="surface">
			<div class="player-zone">
				<div class="zone-header">
					<span class="p-tag">P_01</span>
					<button class="btn-pill start" class:simulated-active={STATE_SYS_ONE_PLAYER.v}>
						<svg class="p-icon" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
							/>
						</svg>
						<span class="legend"
							>{showKeybinds ? formatKeyDisplay(bindings.p1.start) : 'START'}</span
						>
					</button>
				</div>

				<div class="controls-cluster">
					<div class="dpad-cross-container">
						{#if showKeybinds}
							<span class="chassis-label top">UP</span>
							<span class="chassis-label left">LFT</span>
							<span class="chassis-label right">RGT</span>
							<span class="chassis-label bottom">DWN</span>
						{/if}

						<div
							class="dpad-grid"
							class:tilt-up={STATE_P1_UP.v}
							class:tilt-down={STATE_P1_DOWN.v}
							class:tilt-left={STATE_P1_LEFT.v}
							class:tilt-right={STATE_P1_RIGHT.v}
						>
							<button class="dpad-arm up" class:simulated-active={STATE_P1_UP.v}>
								{showKeybinds ? formatKeyDisplay(bindings.p1.up) : '▲'}
							</button>
							<button class="dpad-arm left" class:simulated-active={STATE_P1_LEFT.v}>
								{showKeybinds ? formatKeyDisplay(bindings.p1.left) : '◀'}
							</button>
							<div class="dpad-center"></div>
							<button class="dpad-arm right" class:simulated-active={STATE_P1_RIGHT.v}>
								{showKeybinds ? formatKeyDisplay(bindings.p1.right) : '▶'}
							</button>
							<button class="dpad-arm down" class:simulated-active={STATE_P1_DOWN.v}>
								{showKeybinds ? formatKeyDisplay(bindings.p1.down) : '▼'}
							</button>
						</div>
					</div>

					<div class="actions-group">
						<div class="btn-wrapper">
							<button class="btn-input action a" class:simulated-active={STATE_P1_A.v}
								>{showKeybinds ? formatKeyDisplay(bindings.p1.a) : 'A'}</button
							>
							{#if showKeybinds}<span class="chassis-label bottom">PRI</span>{/if}
						</div>
						<div class="btn-wrapper">
							<button class="btn-input action b" class:simulated-active={STATE_P1_B.v}
								>{showKeybinds ? formatKeyDisplay(bindings.p1.b) : 'B'}</button
							>
							{#if showKeybinds}<span class="chassis-label bottom">SEC</span>{/if}
						</div>
					</div>
				</div>
			</div>

			{#if !singlePlayer}
				<div class="separator">
					<div class="groove"></div>
				</div>

				<div class="player-zone">
					<div class="zone-header">
						<span class="p-tag">P_02</span>
						<button class="btn-pill start" class:simulated-active={STATE_SYS_TWO_PLAYER.v}>
							<svg class="p-icon" viewBox="0 0 24 24" fill="currentColor">
								<path
									d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
								/>
							</svg>
							<span class="legend"
								>{showKeybinds ? formatKeyDisplay(bindings.p2.start) : 'START'}</span
							>
						</button>
					</div>

					<div class="controls-cluster">
						<div class="dpad-cross-container">
							{#if showKeybinds}
								<span class="chassis-label top">UP</span>
								<span class="chassis-label left">LFT</span>
								<span class="chassis-label right">RGT</span>
								<span class="chassis-label bottom">DWN</span>
							{/if}

							<div
								class="dpad-grid"
								class:tilt-up={STATE_P2_UP.v}
								class:tilt-down={STATE_P2_DOWN.v}
								class:tilt-left={STATE_P2_LEFT.v}
								class:tilt-right={STATE_P2_RIGHT.v}
							>
								<button class="dpad-arm up" class:simulated-active={STATE_P2_UP.v}>
									{showKeybinds ? formatKeyDisplay(bindings.p2.up) : '▲'}
								</button>
								<button class="dpad-arm left" class:simulated-active={STATE_P2_LEFT.v}>
									{showKeybinds ? formatKeyDisplay(bindings.p2.left) : '◀'}
								</button>
								<div class="dpad-center"></div>
								<button class="dpad-arm right" class:simulated-active={STATE_P2_RIGHT.v}>
									{showKeybinds ? formatKeyDisplay(bindings.p2.right) : '▶'}
								</button>
								<button class="dpad-arm down" class:simulated-active={STATE_P2_DOWN.v}>
									{showKeybinds ? formatKeyDisplay(bindings.p2.down) : '▼'}
								</button>
							</div>
						</div>

						<div class="actions-group">
							<div class="btn-wrapper">
								<button class="btn-input action a" class:simulated-active={STATE_P2_A.v}
									>{showKeybinds ? formatKeyDisplay(bindings.p2.a) : 'A'}</button
								>
								{#if showKeybinds}<span class="chassis-label bottom">PRI</span>{/if}
							</div>
							<div class="btn-wrapper">
								<button class="btn-input action b" class:simulated-active={STATE_P2_B.v}
									>{showKeybinds ? formatKeyDisplay(bindings.p2.b) : 'B'}</button
								>
								{#if showKeybinds}<span class="chassis-label bottom">SEC</span>{/if}
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</DeckUnit>

<style>
	@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap');

	/* --- Chassis & Layout --- */
	.dark-deck {
		background-color: #1a1b1e;
		font-family: 'Roboto Mono', monospace;
		color: #889096;
		position: relative;
		overflow: hidden;
	}

	.surface {
		display: flex;
		padding: 1.5rem 1rem;
		background: radial-gradient(circle at center, #232529 0%, #1a1b1e 100%);
	}

	/* --- System Strip --- */
	.system-strip {
		background: #111214;
		height: 36px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 1rem;
		border-bottom: 1px solid #000;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05);
	}

	.sys-group {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sys-label {
		font-size: 0.5rem;
		font-weight: 700;
		letter-spacing: 1px;
		color: #444;
	}

	.status-light {
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: #333;
		box-shadow: 0 0 2px #333;
	}
	.status-light.on {
		background: #00ffaa;
		box-shadow: 0 0 5px #00ffaa;
	}

	.btn-sys {
		width: 20px;
		height: 20px;
		background: #25282c;
		border: 1px solid #000;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.1);
	}
	.btn-sys:active,
	.btn-sys.simulated-active {
		background: #1f2124;
		transform: translateY(1px);
	}
	.icon-cog {
		width: 8px;
		height: 8px;
		border: 2px dotted #666;
		border-radius: 50%;
	}

	/* --- Player Zones --- */
	.player-zone {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
	}

	.zone-header {
		width: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 0.5rem;
		border-bottom: 1px dashed #333;
		padding-bottom: 0.5rem;
	}
	.p-tag {
		font-size: 0.6rem;
		font-weight: 700;
		color: #555;
	}

	.separator {
		width: 2px;
		margin: 0 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.groove {
		width: 100%;
		height: 90%;
		background: #0d0e10;
		border-right: 1px solid #333;
	}

	.controls-cluster {
		display: flex;
		align-items: flex-end;
		gap: 2rem;
	}

	/* --- Action Buttons --- */
	.actions-group {
		display: flex;
		gap: 12px;
		align-items: flex-end;
	}
	.btn-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.btn-input.action {
		width: 36px;
		height: 36px;
		font-size: 0.8rem;
		appearance: none;
		outline: none;
		background: #25282c;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		border: 1px solid #000;

		/* Concave Dish Effect */
		box-shadow:
			inset 0 2px 5px rgba(0, 0, 0, 0.8),
			0 1px 0 rgba(255, 255, 255, 0.08),
			0 3px 4px rgba(0, 0, 0, 0.4);

		font-family: 'Roboto Mono', monospace;
		font-weight: 500;
		transition: transform 0.05s;
	}

	.btn-input.action:active,
	.btn-input.action.simulated-active {
		transform: translateY(2px);
		box-shadow: inset 0 3px 6px rgba(0, 0, 0, 1);
		color: #fff;
	}
	.btn-input.action.a {
		color: #d46c6c;
	}
	.btn-input.action.b {
		color: #d4c86c;
	}

	/* --- Labels (Chassis Printing) --- */
	.chassis-label {
		position: absolute;
		font-size: 0.4rem;
		font-weight: 700;
		color: #444;
		white-space: nowrap;
		pointer-events: none;
	}

	.chassis-label.top {
		top: -8px;
		left: 50%;
		transform: translateX(-50%);
	}
	.chassis-label.bottom {
		bottom: -12px;
		left: 50%;
		transform: translateX(-50%);
	}
	.chassis-label.left {
		left: -14px;
		top: 50%;
		transform: translateY(-50%);
	}
	.chassis-label.right {
		right: -14px;
		top: 50%;
		transform: translateY(-50%);
	}

	/* --- Start Pill --- */
	.btn-pill {
		background: #25282c;
		border: 1px solid #111;
		border-radius: 12px;
		padding: 4px 8px 4px 6px; /* Adjusted padding for icon */
		cursor: pointer;
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center; /* Vertically align icon and text */
		gap: 6px; /* Space between icon and text */
	}
	.btn-pill:active,
	.btn-pill.simulated-active {
		background: #1a1b1e;
	}

	.p-icon {
		width: 12px;
		height: 12px;
		color: #555; /* Icon color matches p-tag or slightly darker */
	}

	.legend {
		font-size: 0.5rem;
		font-weight: 700;
		color: #666;
		letter-spacing: 1px;
	}
	/* --- D-PAD CROSS --- */
	.dpad-cross-container {
		position: relative;
		padding: 6px;
		perspective: 800px;
	}

	.dpad-grid {
		display: grid;
		grid-template-columns: repeat(3, 26px);
		grid-template-rows: repeat(3, 26px);

		transform-style: preserve-3d;
		transform-origin: center center;
		transition: transform 0.1s cubic-bezier(0.2, 0.6, 0.3, 1);

		/* --- BALANCE LOGIC --- */
		--tilt-angle: 15deg;
		--val-up: 0deg;
		--val-down: 0deg;
		--val-left: 0deg;
		--val-right: 0deg;

		transform: rotateX(calc(var(--val-up) + var(--val-down)))
			rotateY(calc(var(--val-left) + var(--val-right)));
	}

	/* --- THE 3D BLOCK (Physical Thickness) --- */
	.dpad-grid::after,
	.dpad-grid::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		/* The Cross Shape Clip */
		clip-path: polygon(
			33.33% 0,
			66.66% 0,
			66.66% 33.33%,
			100% 33.33%,
			100% 66.66%,
			66.66% 66.66%,
			66.66% 100%,
			33.33% 100%,
			33.33% 66.66%,
			0 66.66%,
			0 33.33%,
			33.33% 33.33%
		);
	}

	/* Side Walls (Middle) */
	.dpad-grid::after {
		transform: translateZ(-4px);
		background: #111; /* Dark sidewalls */
	}

	/* Bottom Cap & Shadow */
	.dpad-grid::before {
		transform: translateZ(-8px);
		background: #000;
		box-shadow: inset 0 0 10px #000;
	}

	/* --- INPUT MAPPING --- */
	.dpad-grid.tilt-up,
	.dpad-grid:has(.up:active) {
		--val-up: var(--tilt-angle);
	}
	.dpad-grid.tilt-down,
	.dpad-grid:has(.down:active) {
		--val-down: calc(var(--tilt-angle) * -1);
	}
	.dpad-grid.tilt-right,
	.dpad-grid:has(.right:active) {
		--val-right: var(--tilt-angle);
	}
	.dpad-grid.tilt-left,
	.dpad-grid:has(.left:active) {
		--val-left: calc(var(--tilt-angle) * -1);
	}

	/* --- SURFACE VISUALS (Redesigned to match buttons) --- */
	.dpad-arm,
	.dpad-center {
		/* Base Material: Matches the PRI/SEC buttons */
		background-color: #25282c;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #666;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.6rem;
		cursor: pointer;
		/* Crisp Black Border like the buttons */
		border: 1px solid #000;
		outline: none;
		backface-visibility: hidden;
		transition:
			color 0.1s,
			background 0.1s,
			box-shadow 0.1s;
		z-index: 2;
		transform: translateZ(0);
	}

	/* The "Dish" Effect:
       Buttons have `inset 0 2px 5px`.
       We apply this to the D-pad arms to make them feel concave 
       and unified with the button style. 
    */

	.dpad-arm.up {
		grid-column: 2;
		grid-row: 1;
		border-bottom: none; /* Merge with center */
		border-radius: 6px 6px 0 0; /* Slightly softened corners */
		/* Top-heavy concave shadow */
		box-shadow: inset 0 3px 5px rgba(0, 0, 0, 0.8);
	}
	.dpad-arm.down {
		grid-column: 2;
		grid-row: 3;
		border-top: none;
		border-radius: 0 0 6px 6px;
		/* Subtler shadow at bottom, plus the "Edge Highlight" found on buttons */
		box-shadow:
			inset 0 -1px 4px rgba(0, 0, 0, 0.8),
			0 1px 0 rgba(255, 255, 255, 0.08);
	}
	.dpad-arm.left {
		grid-column: 1;
		grid-row: 2;
		border-right: none;
		border-radius: 6px 0 0 6px;
		/* Shadow coming from top-left */
		box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.8);
	}
	.dpad-arm.right {
		grid-column: 3;
		grid-row: 2;
		border-left: none;
		border-radius: 0 6px 6px 0;
		/* Shadow coming from top-right */
		box-shadow: inset -2px 2px 5px rgba(0, 0, 0, 0.8);
	}

	/* The Center Bridge */
	.dpad-center {
		grid-column: 2;
		grid-row: 2;
		border: none; /* No internal borders */
		/* Deepest part of the dish */
		box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.5);
	}

	/* Active State (Mechanical) */
	.dpad-arm:active,
	.dpad-arm.simulated-active {
		color: #fff;
		/* Darken the button, similar to the PRI/SEC active state */
		background: #25282c;
		/* Deep, sharp inset shadow */
		box-shadow: inset 0 0 10px rgba(0, 0, 0, 1);
	}
</style>
