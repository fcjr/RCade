import { InputWebPlugin } from "./input-web";

export interface WebPlugin {
	start(port: MessagePort): void;
	stop(): void;
}

interface PluginInfo {
	plugin: WebPlugin;
	name: string;
	version: string;
}

export class WebPluginManager {
	private plugins: PluginInfo[] = [];

	async acquirePlugin(name: string, _versionRange: string): Promise<{ port: MessagePort; version: string }> {
		const existing = this.plugins.find((p) => p.name === name);
		if (existing) {
			const channel = new MessageChannel();
			existing.plugin.start(channel.port1);
			return { port: channel.port2, version: existing.version };
		}

		let plugin: WebPlugin;
		let version: string;

		if (name === "@rcade/input-classic") {
			plugin = new InputWebPlugin();
			version = "1.0.0";
		} else {
			throw new Error(`Unknown plugin: ${name}`);
		}

		const channel = new MessageChannel();
		plugin.start(channel.port1);
		this.plugins.push({ plugin, name, version });

		return { port: channel.port2, version };
	}

	destroy(): void {
		for (const { plugin } of this.plugins) {
			plugin.stop();
		}
		this.plugins = [];
	}
}
