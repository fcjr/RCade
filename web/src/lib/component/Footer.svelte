<footer class="footer">
	<div class="container">
		<div class="footer-content">
			<div class="footer-brand">
				<h4 class="brand-logo"><span class="dot">@</span>RCade</h4>
				<p>The open-source arcade platform built at The Recurse Center. Push code, play games.</p>
			</div>

			<div class="links-group">
				<div class="footer-section">
					<h4>Resources</h4>
					<nav>
						<a href="#" class="footer-link">Documentation</a>
						<a href="#" class="footer-link">API Reference</a>
						<a href="#" class="footer-link">Example Games</a>
					</nav>
				</div>

				<div class="footer-section">
					<h4>Community</h4>
					<nav>
						<a
							href="https://github.com/fcjr/RCade"
							class="footer-link"
							target="_blank"
							rel="noreferrer"
						>
							GitHub
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="arrow"
								><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"
								></polyline></svg
							>
						</a>
						<a
							href="https://github.com/rcade-community"
							class="footer-link"
							target="_blank"
							rel="noreferrer"
						>
							Archive
							<svg
								xmlns="http://www.w3.org/2000/svg"
								width="12"
								height="12"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
								class="arrow"
								><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"
								></polyline></svg
							>
						</a>
					</nav>
				</div>
			</div>
		</div>

		<div class="footer-bottom">
			<p>&copy; {new Date().getFullYear()} RCade Platform. Open Source (MIT).</p>
			<p class="made-with">
				<a href="https://recurse.com/" target="_blank" rel="noreferrer" class="rc-link">
					Built with <span class="heart">♥</span> at <span class="rc-text">RC</span>
				</a>
			</p>
		</div>
	</div>
</footer>

<style>
	.footer {
		padding: 6rem 0 2rem;
		margin-top: 6rem;
		background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.02));
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		position: relative;
	}

	/* Top decorative line glow */
	.footer::before {
		content: '';
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%);
		width: 60%;
		height: 1px;
		background: linear-gradient(90deg, transparent, rgba(250, 204, 21, 0.3), transparent);
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 0 2rem;
	}

	.footer-content {
		display: flex;
		justify-content: space-between;
		gap: 4rem;
		margin-bottom: 4rem;
	}

	/* --- Brand --- */
	.footer-brand {
		max-width: 300px;
	}

	.brand-logo {
		font-family: 'Jersey 10', sans-serif;
		font-size: 3rem;
		font-weight: 400;
		margin: 0 0 1rem;
		color: #fff;
		letter-spacing: -0.02em;
		line-height: 0.6;
	}

	.dot {
		color: #facc15;
	}

	.footer-brand p {
		color: rgba(255, 255, 255, 0.5);
		line-height: 1.6;
		font-size: 0.95rem;
		margin: 0;
	}

	/* --- Links --- */
	.links-group {
		display: flex;
		gap: 5rem;
	}

	.footer-section h4 {
		color: #f5f5f5;
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 1.5rem;
		font-family: 'DM Sans', sans-serif;
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.footer-link {
		color: rgba(255, 255, 255, 0.6);
		text-decoration: none;
		font-size: 0.95rem;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.footer-link:hover {
		color: #facc15;
		transform: translateX(2px);
	}

	.arrow {
		opacity: 0;
		transform: translate(-2px, 2px);
		transition: all 0.2s;
	}

	.footer-link:hover .arrow {
		opacity: 1;
		transform: translate(0, 0);
	}

	/* --- Bottom Bar --- */
	.footer-bottom {
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		padding-top: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.4);
	}

	.heart {
		color: #ef4444;
		display: inline-block;
		animation: heartbeat 1.5s ease-in-out infinite;
	}

	@keyframes heartbeat {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	/* Responsive */
	@media (max-width: 768px) {
		.footer-content {
			flex-direction: column;
			gap: 3rem;
		}

		.links-group {
			flex-direction: column;
			gap: 2rem;
		}

		.footer-bottom {
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}
	}
	/* --- Footer Bottom Layout --- */
	.footer-bottom {
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		padding-top: 2rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.4);
		position: relative;
		z-index: 10;
	}

	/* --- The Link Container --- */
	.rc-link {
		text-decoration: none;
		color: inherit;
		transition: all 0.3s ease; /* Slower, smoother transition */
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	/* On hover, brighten the text gently */
	.rc-link:hover {
		color: #fff;
		text-decoration: underline;
	}

	/* --- The Heart --- */
	.heart {
		color: #ef4444;
		display: inline-block;
		/* A slow, resting heartbeat */
		animation: heartbeat 2s ease-in-out infinite;
		transition: all 0.3s ease;
	}

	@keyframes heartbeat {
		0%,
		100% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
	}

	/* Easter Egg 1: Heart blooms and glows (no speed change!) */
	.rc-link:hover .heart {
		transform: scale(1.25); /* Grows bigger */
		filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.6)); /* Adds a warm glow */
		animation: none; /* Stops beating to hold the "full" shape, or keep it if you prefer */
	}

	/* --- The "RC" Text --- */
	.rc-text {
		display: inline-block;
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); /* Bouncy transition */
	}

	/* Easter Egg 2: "RC" turns into a Golden Arcade Token */
	.rc-link:hover .rc-text {
		font-family: 'Jersey 10', sans-serif; /* Your brand font */
		font-size: 1.4rem; /* Get slightly larger */
		line-height: 0.8; /* Fix alignment for the tall font */
		color: #facc15; /* Gold */

		/* A soft, magical gold aura instead of a glitch */
		text-shadow: 0 0 12px rgba(250, 204, 21, 0.4);

		/* Slight lift like a floating game item */
		transform: translateY(-3px) rotate(-3deg);
	}
</style>
