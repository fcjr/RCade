<script lang="ts">
	let { currentGame = 'Snake Evolved', onJoin = () => console.log('Join clicked') } = $props();
</script>

<div class="status-ticker" role="status" aria-label="Cabinet Status">
	<div class="container">
		<div class="broadcast-section">
			<div class="signal-indicator">
				<div class="waves">
					<span></span><span></span>
				</div>
				<div class="dot"></div>
			</div>

			<div class="program-info">
				<span class="label">LIVE CABINET</span>
				<span class="separator">//</span>
				<span class="game-title">{currentGame}</span>
			</div>
		</div>

		<div class="queue-section">
			<div class="queue-status">
				<span class="status-dot"></span>
				Open for Remote recursers
			</div>

			<button class="join-btn">
				<span>Join</span>
			</button>
		</div>
	</div>

	<div class="scanlines"></div>
</div>

<style>
	.status-ticker {
		background: #050505;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		font-family: 'JetBrains Mono', monospace;
		height: 44px;
		position: relative;
		z-index: 200;
		overflow: hidden;
		user-select: none;
	}

	.container {
		max-width: 1300px;
		margin: 0 auto;
		padding: 0 2rem;
		height: 100%;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	/* --- Left: Broadcast --- */
	.broadcast-section {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: #f5f5f5;
	}

	/* Animated Signal Icon */
	.signal-indicator {
		position: relative;
		width: 16px;
		height: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.dot {
		width: 6px;
		height: 6px;
		background: #ef4444;
		border-radius: 50%;
		z-index: 2;
		box-shadow: 0 0 8px #ef4444;
	}

	.waves span {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 100%;
		height: 100%;
		border-radius: 50%;
		border: 1px solid rgba(239, 68, 68, 0.5);
		opacity: 0;
	}

	.waves span:nth-child(1) {
		animation: ripple 2s infinite cubic-bezier(0, 0.2, 0.8, 1);
	}
	.waves span:nth-child(2) {
		animation: ripple 2s infinite 0.4s cubic-bezier(0, 0.2, 0.8, 1);
	}

	@keyframes ripple {
		0% {
			width: 0;
			height: 0;
			opacity: 1;
		}
		100% {
			width: 24px;
			height: 24px;
			opacity: 0;
		}
	}

	.program-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.75rem;
	}

	.label {
		color: rgba(255, 255, 255, 0.5);
		font-weight: 500;
		letter-spacing: 0.05em;
	}

	.separator {
		color: #333;
	}

	.game-title {
		color: #facc15;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		background: rgba(250, 204, 21, 0.1);
		padding: 2px 8px;
		border-radius: 4px;
	}

	/* --- Right: Queue Section --- */
	.queue-section {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.queue-status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #4ade80; /* Green */
		text-transform: uppercase;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.status-dot {
		width: 6px;
		height: 6px;
		background: #4ade80;
		border-radius: 50%;
	}

	.join-btn {
		background: transparent;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #fff;
		font-family: 'JetBrains Mono', monospace;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		padding: 6px 16px;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.join-btn:hover {
		background: #facc15;
		border-color: #facc15;
		color: #000;
		box-shadow: 0 0 15px rgba(250, 204, 21, 0.4);
	}

	/* --- Scanlines --- */
	.scanlines {
		position: absolute;
		inset: 0;
		background: repeating-linear-gradient(
			to bottom,
			transparent 0px,
			transparent 2px,
			rgba(0, 0, 0, 0.3) 3px
		);
		pointer-events: none;
	}

	/* --- Responsive --- */
	@media (max-width: 640px) {
		.container {
			padding: 0 1rem;
		}

		.label,
		.separator,
		.queue-status {
			display: none;
		}

		.game-title {
			font-size: 0.7rem;
		}
	}
</style>
