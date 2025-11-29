export class PluginChannel {
    // Map of pending acquire requests: key is "name:version"
    private static pendingAcquires = new Map<string, (channel: PluginChannel) => void>();

    // Map of available channels that arrived before acquire was called
    private static availableChannels = new Map<string, MessagePort>();

    static {
        window.parent.postMessage("request_plugin_channels", "*");

        window.addEventListener('message', (event) => {
            if (event.data?.type === 'plugin_channel_created') {
                const { name, version } = event.data.channel;
                const port = event.ports[0];

                if (!name || !version || !port) {
                    console.warn('Invalid plugin_channel_created event', event.data);
                    return;
                }

                const key = `${name}:${version}`;

                // Check if there's a pending acquire request
                const resolver = PluginChannel.pendingAcquires.get(key);
                if (resolver) {
                    // Fulfill the pending request
                    const channel = new PluginChannel(port);
                    resolver(channel);
                    PluginChannel.pendingAcquires.delete(key);
                } else {
                    // Store the channel for later
                    PluginChannel.availableChannels.set(key, port);
                }
            }
        });
    }

    public static async acquire(name: string, version: string) {
        const key = `${name}:${version}`;

        // Check if channel is already available
        const availablePort = PluginChannel.availableChannels.get(key);
        if (availablePort) {
            PluginChannel.availableChannels.delete(key);
            return Promise.resolve(new PluginChannel(availablePort));
        }

        // Register a pending acquire request
        return new Promise<PluginChannel>((resolve) => {
            PluginChannel.pendingAcquires.set(key, resolve);
        });
    }

    private constructor(
        private port: MessagePort,
    ) { }

    // Utility method to access the message port
    public getPort(): MessagePort {
        return this.port;
    }
}