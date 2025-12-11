export interface PluginProvider {
    getChannelName(): string;
    getChannel(version: string): { channel: MessagePort, name: string, version: string };
}