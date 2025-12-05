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
            // Check if this is a response to a pending request
            if (!handleResponse(e.data)) {
                handleMessage(e.data);
            }
        };

        // Initialize user code
        Promise.resolve().then(() => init()).catch((e) => {
            console.error('Plugin initialization error:', e);
        });
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

const pendingRequests = new Map();

function generateNonce() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Send a request to the plugin and wait for a response.
 * The plugin must respond with a message containing the same `_nonce` field.
 */
function request(message, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const _nonce = generateNonce();

        const timeout = setTimeout(() => {
            pendingRequests.delete(_nonce);
            reject(new Error('Request timed out'));
        }, timeoutMs);

        pendingRequests.set(_nonce, {
            resolve: (data) => {
                clearTimeout(timeout);
                resolve(data);
            },
            reject: (error) => {
                clearTimeout(timeout);
                reject(error);
            },
        });

        port.postMessage({ ...message, _nonce });
    });
}

// Internal handler for responses
function handleResponse(data) {
    const { _nonce } = data ?? {};
    if (_nonce && pendingRequests.has(_nonce)) {
        const pending = pendingRequests.get(_nonce);
        pendingRequests.delete(_nonce);
        pending.resolve(data);
        return true;
    }
    return false;
}

function getMemory() {
    return memory;
}

function getMemoryView() {
    return new Uint8Array(memory);
}