let port;
let memory;
let lockView;

const UNLOCKED = 0;
const LOCKED_BY_RUST = 1;
const LOCKED_BY_JS = 2;
const LOCK_OFFSET = 0;
const DATA_OFFSET = 4;

self.addEventListener('message', (event) => {
    if (event.ports && event.ports.length > 0 && event.data.memory) {
        // Initial setup message - port comes from ports array
        port = event.ports[0];
        memory = event.data.memory;
        lockView = new Int32Array(memory, 0, 1);

        // Set up port message handler
        port.onmessage = (e) => {
            handleMessage(e.data);
        };

        // Initialize user code
        try {
            init();
        } catch (e) {
            console.error('Plugin initialization error:', e);
        }
    }
});

// Acquire lock (blocking)
function lock() {
    while (true) {
        const prev = Atomics.compareExchange(lockView, LOCK_OFFSET, UNLOCKED, LOCKED_BY_JS);
        if (prev === UNLOCKED) {
            return new MemoryGuard();
        }
        Atomics.wait(lockView, LOCK_OFFSET, prev);
    }
}

// Try to acquire lock (non-blocking)
function tryLock() {
    const prev = Atomics.compareExchange(lockView, LOCK_OFFSET, UNLOCKED, LOCKED_BY_JS);
    if (prev === UNLOCKED) {
        return new MemoryGuard();
    }
    return null;
}

class MemoryGuard {
    constructor() {
        this.released = false;
    }

    getDataView() {
        if (this.released) {
            throw new Error('Lock already released');
        }
        return new Uint8Array(memory, DATA_OFFSET);
    }

    release() {
        if (!this.released) {
            Atomics.store(lockView, LOCK_OFFSET, UNLOCKED);
            Atomics.notify(lockView, LOCK_OFFSET, 1);
            this.released = true;
        }
    }
}

// Helper functions available to plugin code
function send(data) {
    if (port) {
        port.postMessage(data);
    }
}

function getMemory() {
    return memory;
}

function getMemoryView() {
    return new Uint8Array(memory);
}