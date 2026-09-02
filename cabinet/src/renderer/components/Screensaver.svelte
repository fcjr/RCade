<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import octopusImg from "/octopus.png";
  import type { ScreensaverConfig } from "@rcade/plugin-sleep";

  const LOGO_SIZE = 60;
  const SPEED = 0.05;
  const DEFAULT_CONFIG: Required<ScreensaverConfig> = {
    transparent: false,
    visible: true,
    timeBeforeActive: 30_000,
    timeBeforeForcedExit: 60_000,
  };

  let config: Required<ScreensaverConfig> = $state(DEFAULT_CONFIG);

  let isIdle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let exitTimer: ReturnType<typeof setTimeout> | undefined;

  let logoX = $state(100);
  let logoY = $state(100);
  let velocityX = SPEED;
  let velocityY = SPEED;
  let animationFrame: number | undefined;
  let lastTime: number | undefined;

  function resetExitTimer(start: boolean) {
    if (exitTimer) clearTimeout(exitTimer);
    if (!start || config.timeBeforeForcedExit == Infinity) return;

    exitTimer = setTimeout(() => {
      window.rcade.exitToMenu();
    }, config.timeBeforeForcedExit);
  }
  function resetIdleTimer() {
    resetExitTimer(false);
    if (idleTimer) clearTimeout(idleTimer);
    if (isIdle) {
      isIdle = false;
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = undefined;
      }
      lastTime = undefined;
    }
    if (config.timeBeforeActive == Infinity) return;
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
      resetExitTimer(true);
    }, config.timeBeforeActive);
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

  $effect(() => {
    if (isIdle) window.rcade.screensaverStarted();
    else window.rcade.screensaverStopped();
  });

  function normalizeTime(value: unknown): number | undefined {
    // invalid values fall back to the default
    if (typeof value !== "number" || isNaN(value)) return;
    // infinite times mean a disabled timer
    if (value === Infinity) return Infinity;

    // clamp to what setTimeout accepts
    if (value >= 2 ** 31) return 2 ** 31 - 1;
    if (value < 1) return 1;

    return value;
  }

  // The sleep plugin sends the merged settings of every live plugin instance
  // (the menu's and the running game's). Anything left unset falls back to
  // the default, so a game's settings never outlive the game.
  function screensaverConfigChanged(overrides: ScreensaverConfig) {
    const newConfig: Required<ScreensaverConfig> = { ...DEFAULT_CONFIG };

    if (typeof overrides.transparent === "boolean")
      newConfig.transparent = overrides.transparent;
    if (typeof overrides.visible === "boolean")
      newConfig.visible = overrides.visible;

    const timeBeforeActive = normalizeTime(overrides.timeBeforeActive);
    if (timeBeforeActive !== undefined)
      newConfig.timeBeforeActive = timeBeforeActive;

    const timeBeforeForcedExit = normalizeTime(overrides.timeBeforeForcedExit);
    if (timeBeforeForcedExit !== undefined)
      newConfig.timeBeforeForcedExit = timeBeforeForcedExit;

    const needsTimerUpdate =
      newConfig.timeBeforeActive != config.timeBeforeActive ||
      newConfig.timeBeforeForcedExit != config.timeBeforeForcedExit;

    config = newConfig;

    if (needsTimerUpdate) resetIdleTimer();
  }

  let unsubscribeInputActivity: (() => void) | undefined;
  let unsubscribeScreensaverConfigChanged: (() => void) | undefined;

  onMount(() => {
    window.addEventListener("keydown", resetIdleTimer, true);
    window.addEventListener("keyup", resetIdleTimer, true);
    // Also listen for input activity from main process (captures iframe key events)
    unsubscribeInputActivity = window.rcade.onInputActivity(resetIdleTimer);
    unsubscribeScreensaverConfigChanged =
      window.rcade.onScreensaverConfigChanged(screensaverConfigChanged);
    resetIdleTimer();
  });

  onDestroy(() => {
    if (idleTimer) clearTimeout(idleTimer);
    if (exitTimer) clearTimeout(exitTimer);
    if (animationFrame) cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", resetIdleTimer, true);
    window.removeEventListener("keyup", resetIdleTimer, true);
    unsubscribeInputActivity?.();
    unsubscribeScreensaverConfigChanged?.();
  });
</script>

{#if isIdle && config.visible}
  <div class="screensaver {config.transparent ? '' : 'black-bg'}">
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
    z-index: 9999;
  }

  .black-bg {
    background: #000;
  }

  .logo {
    position: absolute;
    pointer-events: none;
  }
</style>
