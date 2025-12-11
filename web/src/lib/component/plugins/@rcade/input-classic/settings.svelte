<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	interface Bindings {
		p1: Record<string, string>;
		p2: Record<string, string>;
		sys: Record<string, string>;
	}

	interface Props {
		open?: boolean;
		bindings: Bindings;
		onClose: () => void;
		onSave: (newBindings: Bindings) => void;
	}

	let { open = false, bindings, onClose, onSave } = $props();

	let localBindings = $state(JSON.parse(JSON.stringify(bindings)));
	let listeningFor: { player: 'p1' | 'p2' | 'sys'; key: string } | null = $state(null);

	$effect(() => {
		if (open) {
			localBindings = JSON.parse(JSON.stringify(bindings));
			listeningFor = null;
		}
	});

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

	function startListening(player: 'p1' | 'p2' | 'sys', key: string) {
		listeningFor = { player, key };
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!open) return;

		if (listeningFor) {
			e.preventDefault();
			e.stopPropagation();

			if (e.key === 'Escape' && listeningFor.key !== 'menu') {
				listeningFor = null;
				return;
			}

			localBindings[listeningFor.player][listeningFor.key] = e.key;
			listeningFor = null;
			return;
		}

		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleSave() {
		onSave(localBindings);
		onClose();
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

{#if open}
	<div
		class="backdrop"
		onclick={onClose}
		role="button"
		tabindex="-1"
		transition:fade={{ duration: 200 }}
	></div>

	<div
		class="modal-chassis"
		transition:scale={{ duration: 250, start: 0.95, easing: quintOut, opacity: 0 }}
	>
		<div class="modal-header">
			<div class="header-title">
				<div class="icon-cog"></div>
				<span>SYSTEM CONFIG // INPUT MAP</span>
			</div>
			<button class="btn-close" onclick={onClose}>×</button>
		</div>

		<div class="modal-body">
			<div class="column">
				<div class="col-header">PLAYER_01</div>
				<div class="input-grid">
					{#each Object.entries(localBindings.p1) as [key, val]}
						<div class="control-row">
							<span class="label">{key.toUpperCase()}</span>
							<button
								class="key-input"
								class:active={listeningFor?.player === 'p1' && listeningFor?.key === key}
								onclick={() => startListening('p1', key)}
							>
								{#if listeningFor?.player === 'p1' && listeningFor?.key === key}
									<span class="blink">_</span>
								{:else}
									{formatKeyDisplay(val as string)}
								{/if}
							</button>
						</div>
					{/each}
				</div>
			</div>

			<div class="v-sep"></div>

			<div class="column">
				<div class="col-header">PLAYER_02</div>
				<div class="input-grid">
					{#each Object.entries(localBindings.p2) as [key, val]}
						<div class="control-row">
							<span class="label">{key.toUpperCase()}</span>
							<button
								class="key-input"
								class:active={listeningFor?.player === 'p2' && listeningFor?.key === key}
								onclick={() => startListening('p2', key)}
							>
								{#if listeningFor?.player === 'p2' && listeningFor?.key === key}
									<span class="blink">_</span>
								{:else}
									{formatKeyDisplay(val as string)}
								{/if}
							</button>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<div class="modal-footer">
			<div class="hint-text">
				{#if listeningFor}
					PRESS ANY KEY... (ESC TO CANCEL)
				{:else}
					CLICK A SLOT TO REBIND
				{/if}
			</div>
			<div class="actions">
				<button class="btn-text cancel" onclick={onClose}>CANCEL</button>
				<button class="btn-text save" onclick={handleSave}>CONFIRM</button>
			</div>
		</div>
	</div>
{/if}

<style>
	@import url('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;700&display=swap');

	.backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(2px);
		z-index: 999;
	}

	.modal-chassis {
		position: fixed;
		top: 50%;
		left: 50%;
		/* Using translate in CSS + transition:scale in Svelte can sometimes conflict 
           if not handled carefully, but Svelte's `scale` usually handles transform origin well.
           To ensure centering stays perfect during animation, we rely on the transform: translate 
           being preserved or managed by the wrapper context, but Svelte transitions manipulate the 
           transform property directly.
           
           Fix: We set the transform in the CSS, Svelte appends the scale to it.
        */
		transform: translate(-50%, -50%);
		width: 500px;
		background: #1a1b1e;
		border: 1px solid #333;
		box-shadow:
			0 20px 50px rgba(0, 0, 0, 0.8),
			0 0 0 1px #000;
		z-index: 1000;
		font-family: 'Roboto Mono', monospace;
		color: #889096;
		display: flex;
		flex-direction: column;
	}

	/* --- Header --- */
	.modal-header {
		background: #111214;
		padding: 0.75rem 1rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		border-bottom: 1px solid #000;
	}

	.header-title {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 1px;
		color: #666;
	}

	.icon-cog {
		width: 12px;
		height: 12px;
		border: 2px dotted #444;
		border-radius: 50%;
	}

	.btn-close {
		background: none;
		border: none;
		color: #444;
		font-size: 1.2rem;
		cursor: pointer;
		line-height: 1;
	}
	.btn-close:hover {
		color: #fff;
	}

	/* --- Body --- */
	.modal-body {
		padding: 1.5rem;
		display: flex;
		background: radial-gradient(circle at center, #232529 0%, #1a1b1e 100%);
	}

	.column {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.col-header {
		font-size: 0.6rem;
		font-weight: 700;
		color: #444;
		text-align: center;
		border-bottom: 1px dashed #333;
		padding-bottom: 4px;
		margin-bottom: 4px;
	}

	.v-sep {
		width: 1px;
		background: #333;
		margin: 0 1.5rem;
	}

	.input-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.control-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.label {
		font-size: 0.6rem;
		font-weight: 500;
		color: #666;
	}

	.key-input {
		width: 60px;
		height: 24px;
		background: #0d0e10;
		border: 1px solid #333;
		color: #aaa;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.5);
		transition: all 0.1s;
	}

	.key-input:hover {
		border-color: #555;
		color: #fff;
	}

	.key-input.active {
		background: #d4c86c; /* Retro Amber/Yellow */
		color: #000;
		border-color: #d4c86c;
		font-weight: 700;
		box-shadow: 0 0 10px rgba(212, 200, 108, 0.2);
	}

	.blink {
		animation: blinker 1s linear infinite;
	}
	@keyframes blinker {
		50% {
			opacity: 0;
		}
	}

	/* --- Footer --- */
	.modal-footer {
		padding: 0.75rem 1rem;
		background: #111214;
		border-top: 1px solid #000;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.hint-text {
		font-size: 0.55rem;
		color: #444;
		font-style: italic;
	}

	.actions {
		display: flex;
		gap: 1rem;
	}

	.btn-text {
		background: none;
		border: none;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.7rem;
		font-weight: 700;
		cursor: pointer;
		text-transform: uppercase;
		padding: 4px 8px;
		border-radius: 4px;
	}

	.btn-text.cancel {
		color: #666;
	}
	.btn-text.cancel:hover {
		color: #888;
		background: #1a1b1e;
	}

	.btn-text.save {
		background: #333;
		color: #fff;
		box-shadow: 0 1px 0 #000;
	}
	.btn-text.save:hover {
		background: #00ffaa;
		color: #000;
	}
</style>
