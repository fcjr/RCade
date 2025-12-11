/**
 * Persistence module for ServiceWorker environments
 * Uses Cache API for reliable key-value storage
 */

const CACHE_NAME = 'persistence-cache-v1';
const CACHE_URL_PREFIX = 'https://persistence.rcade-game/';

/**
 * Reads a value from persistent storage
 * @param key - The key to read
 * @returns The stored value, or throws if not found
 */
export async function read(key: string): Promise<string> {
    if (!key) {
        throw new Error('Key cannot be empty');
    }

    const cache = await caches.open(CACHE_NAME);
    const url = `${CACHE_URL_PREFIX}${encodeURIComponent(key)}`;
    const response = await cache.match(url);

    if (!response) {
        throw new Error(`Key not found: ${key}`);
    }

    return await response.text();
}

/**
 * Writes a value to persistent storage
 * @param key - The key to write
 * @param value - The value to store
 */
export async function write(key: string, value: string): Promise<void> {
    if (!key) {
        throw new Error('Key cannot be empty');
    }

    const cache = await caches.open(CACHE_NAME);
    const url = `${CACHE_URL_PREFIX}${encodeURIComponent(key)}`;

    const response = new Response(value, {
        headers: {
            'Content-Type': 'text/plain',
            'Cache-Control': 'no-cache',
        },
    });

    await cache.put(url, response);
}

/**
 * Delete a key from storage
 * @param key - The key to delete
 * @returns true if deleted, false if not found
 */
export async function remove(key: string): Promise<boolean> {
    if (!key) {
        throw new Error('Key cannot be empty');
    }

    const cache = await caches.open(CACHE_NAME);
    const url = `${CACHE_URL_PREFIX}${encodeURIComponent(key)}`;
    return await cache.delete(url);
}

/**
 * List all keys in storage
 * @returns Array of all stored keys
 */
export async function keys(): Promise<string[]> {
    const cache = await caches.open(CACHE_NAME);
    const requests = await cache.keys();

    return requests
        .map(req => {
            const url = new URL(req.url);
            return url.pathname.slice(1); // Remove leading '/'
        })
        .map(encoded => decodeURIComponent(encoded));
}

/**
 * Clear all stored data
 */
export async function clear(): Promise<void> {
    await caches.delete(CACHE_NAME);
}