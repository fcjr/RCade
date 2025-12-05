type PendingRequest = {
    resolve: (data: unknown) => void;
    reject: (error: Error) => void;
};

export class PluginChannel {
    private pendingRequests = new Map<string, PendingRequest>();

    public static async acquire(name: string, version: string) {
        const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        return new Promise<PluginChannel>((resolve, reject) => {
            // Create a listener for this specific acquire request
            const listener = (event: MessageEvent) => {
                if (event.data?.type === 'plugin_channel' && event.data?.nonce === nonce) {
                    const port = event.ports[0];

                    // Check for error response
                    if ("error" in event.data) {
                        window.removeEventListener('message', listener);
                        reject(new Error(event.data.error));
                        return;
                    }

                    const { channel } = event.data;

                    if (!channel?.name || !channel?.version || !port) {
                        console.warn('Invalid plugin_channel event', event.data);
                        return;
                    }

                    // Remove the listener
                    window.removeEventListener('message', listener);

                    // Resolve with the new channel
                    const pluginChannel = new PluginChannel(port, channel);
                    resolve(pluginChannel);
                }
            };

            // Register the listener
            window.addEventListener('message', listener);

            // Send the acquire message
            window.parent.postMessage({
                type: "acquire_plugin_channel",
                nonce,
                channel: { name, version }
            }, "*");
        });
    }

    private constructor(
        private port: MessagePort,
        private channel: { name: unknown, version: unknown },
    ) {
        // Listen for responses to requests
        this.port.addEventListener('message', (event: MessageEvent) => {
            const { _nonce } = event.data ?? {};
            if (_nonce && this.pendingRequests.has(_nonce)) {
                const pending = this.pendingRequests.get(_nonce)!;
                this.pendingRequests.delete(_nonce);
                pending.resolve(event.data);
            }
        });
        this.port.start();
    }

    // Utility method to access the message port
    public getPort(): MessagePort {
        return this.port;
    }

    public getVersion(): String {
        return String(this.channel.version);
    }

    /**
     * Send a request to the plugin and wait for a response.
     * The plugin must respond with a message containing the same `_nonce` field.
     */
    public request<T = unknown>(message: Record<string, unknown>, timeoutMs = 5000): Promise<T> {
        const _nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

        return new Promise<T>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(_nonce);
                reject(new Error('Request timed out'));
            }, timeoutMs);

            this.pendingRequests.set(_nonce, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data as T);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
            });

            this.port.postMessage({ ...message, _nonce });
        });
    }
}