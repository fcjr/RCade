<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import octopusImg from "/octopus.png";

  const IDLE_TIMEOUT_MS = 15000;
  const LOGO_SIZE = 60;
  const SPEED = 0.05;

  let isIdle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  let logoX = $state(100);
  let logoY = $state(100);
  let velocityX = SPEED;
  let velocityY = SPEED;
  let animationFrame: number | undefined;
  let lastTime: number | undefined;

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (isIdle) {
      isIdle = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      lastTime = undefined;
    }
    idleTimer = setTimeout(() => {
      isIdle = true;
      // randomize starting position
      logoX = Math.random() * (window.innerWidth - LOGO_SIZE);
      logoY = Math.random() * (window.innerHeight - LOGO_SIZE);
      // use coprime-ish velocities for better coverage
      // randome speeds means the path won't repeat exactly
      velocityX = SPEED * (0.9 + Math.random() * 0.2);
      velocityY = SPEED * (0.7 + Math.random() * 0.2);
      lastTime = undefined;
      animateLogo(performance.now());
    }, IDLE_TIMEOUT_MS);
  }

  function animateLogo(currentTime: number) {
    if (!isIdle) return;

    if (lastTime === undefined) {
      lastTime = currentTime;
    }

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    const maxX = window.innerWidth - LOGO_SIZE;
    const maxY = window.innerHeight - LOGO_SIZE;

    logoX += velocityX * deltaTime;
    logoY += velocityY * deltaTime;

    if (logoX <= 0) {
      logoX = 0;
      velocityX = Math.abs(velocityX);
    } else if (logoX >= maxX) {
      logoX = maxX;
      velocityX = -Math.abs(velocityX);
    }

    if (logoY <= 0) {
      logoY = 0;
      velocityY = Math.abs(velocityY);
    } else if (logoY >= maxY) {
      logoY = maxY;
      velocityY = -Math.abs(velocityY);
    }

    animationFrame = requestAnimationFrame(animateLogo);
  }

  onMount(() => {
    window.addEventListener('keydown', resetIdleTimer, true);
    window.addEventListener('keyup', resetIdleTimer, true);
    resetIdleTimer();
  });

  onDestroy(() => {
    if (idleTimer) clearTimeout(idleTimer);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener('keydown', resetIdleTimer, true);
    window.removeEventListener('keyup', resetIdleTimer, true);
  });
</script>

{#if isIdle}
  <div class="screensaver">
    <img
      class="logo"
      src={octopusImg}
      alt="Octopus"
      style="left: {logoX}px; top: {logoY}px; width: {LOGO_SIZE}px; height: {LOGO_SIZE}px;"
    />
  </div>
{/if}

<style>
  .screensaver {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #000;
    z-index: 9999;
  }

  .logo {
    position: absolute;
    pointer-events: none;
  }
</style>
