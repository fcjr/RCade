// Audio context and buffer cache
let audioContext: AudioContext | null = null;
let menuMoveBuffer: AudioBuffer | null = null;

// Frequency tracking
const callTimestamps: number[] = [];
const FREQUENCY_WINDOW = 500; // Track calls in last 500ms

// Initialize audio context and load the sound
async function initAudio(): Promise<void> {
    if (!audioContext) {
        audioContext = new AudioContext();
    }

    if (!menuMoveBuffer) {
        const response = await fetch('/menu_move.wav');
        const arrayBuffer = await response.arrayBuffer();
        menuMoveBuffer = await audioContext.decodeAudioData(arrayBuffer);
    }
}

// Play the menu move sound with random pitch variation
export async function play_menu_move(): Promise<void> {
    // Ensure audio is initialized
    if (!audioContext || !menuMoveBuffer) {
        await initAudio();
    }

    if (!audioContext || !menuMoveBuffer) {
        console.error('Failed to initialize audio');
        return;
    }

    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // Track this call
    const now = Date.now();
    callTimestamps.push(now);

    // Remove timestamps older than the window
    const windowStart = now - FREQUENCY_WINDOW;
    while (callTimestamps.length > 0 && callTimestamps[0] < windowStart) {
        callTimestamps.shift();
    }

    // Calculate calls per second
    const callsInWindow = callTimestamps.length;
    const callsPerSecond = (callsInWindow / FREQUENCY_WINDOW) * 1000;

    // Map frequency to pitch: 0-20 calls/sec -> 0.85-1.15 playback rate
    // Uses a logarithmic-like curve for more natural feel
    const basePitch = 0.85 + Math.min(callsPerSecond / 15, 2) * 0.3;

    // Add small random variation on top (±3%)
    const pitchVariation = basePitch + (Math.random() - 0.5) * 0.06;

    // Create a new source for this playback
    const source = audioContext.createBufferSource();
    source.buffer = menuMoveBuffer;

    // Create gain node for volume control
    const gainNode = audioContext.createGain();

    // Apply pitch
    source.playbackRate.value = pitchVariation;

    // Slight volume variation for more natural feel: 0.7 to 1.0
    const volumeVariation = 0.7 + Math.random() * 0.3;
    gainNode.gain.value = volumeVariation;

    // Connect: source -> gain -> destination
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Play the sound
    source.start(0);
}

// Optional: Preload function to call on app init
export async function preloadMenuSound(): Promise<void> {
    await initAudio();
}

// Example usage:
// await preloadMenuSound(); // Call once on app init
// play_menu_move(); // Call whenever needed - no await needed for fire-and-forget