import { GameManifest, PluginManifest } from "@rcade/api"
import * as semver from "semver"
import { MessageChannelMain, type MessagePortMain, type WebContents } from "electron";
import { PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";

import PluginInputClassic from "@rcade/input-classic";
import PluginInputClassicManifest from "@rcade/input-classic/rcade.manifest.json";
import PluginInputSpinners from "@rcade/input-spinners";
import PluginInputSpinnersManifest from "@rcade/input-spinners/rcade.manifest.json";
import PluginSleep from "@rcade/sleep";
import PluginSleepManifest from "@rcade/sleep/rcade.manifest.json";
import PluginMenu from "@rcade/plugin-menu-backend";
import PluginMenuManifest from "@rcade/plugin-menu-backend/rcade.manifest.json";

export class PluginManager {
    public static async loadInto(wc: WebContents, preload: GameManifest["dependencies"]) {
        const manager = new PluginManager(wc);

        for (let channel of preload ?? []) {
            await manager.load(channel.name, channel.version);
        }

        return manager;
    }

    private constructor(private wc: WebContents) {
        this.handler = async (event: Electron.Event, name: string, v: string) => {
            const nonce = crypto.randomUUID();

            const { port, version } = await this.start(name, v);

            wc.postMessage("plugin-port-ready", { nonce, name, version }, [port])

            return { nonce }
        };

        // Remove any existing handler (e.g., from a previous game that crashed without cleanup)
        try {
            wc.ipc.removeHandler("get-plugin-port");
        } catch {
            // Handler didn't exist, that's fine
        }

        wc.ipc.handle("get-plugin-port", this.handler);
    }

    private handler: any;

    private ref(name: string): { plugin: { new(): Plugin }, manifest: PluginManifest } {
        switch (name) {
            case "@rcade/input-classic": return { plugin: PluginInputClassic, manifest: PluginInputClassicManifest as PluginManifest };
            case "@rcade/input-spinners": return { plugin: PluginInputSpinners, manifest: PluginInputSpinnersManifest as PluginManifest };
            case "@rcade/sleep": return { plugin: PluginSleep, manifest: PluginSleepManifest as PluginManifest };
            case "@rcade/menu": return { plugin: PluginMenu, manifest: PluginMenuManifest as PluginManifest };
        }

        throw new Error(`Unknown Plugin ${name}`);
    }

    private loadedPlugins: { plugin: Plugin, name: string, version: string }[] = [];

    async load(name: string, version: string): Promise<{ plugin: Plugin, version: string }> {
        for (let loaded of this.loadedPlugins) {
            if (loaded.name == name && semver.satisfies(loaded.version, version)) {
                return loaded
            }
        }

        const { plugin, manifest } = this.ref(name);

        if (!semver.satisfies(manifest.version!, version)) {
            throw new Error(`Version Not Found. Has: ${manifest.version}, Expected: ${version}`);
        }

        const loaded = new plugin();

        this.loadedPlugins.push({ plugin: loaded, name, version: manifest.version! });

        return { plugin: loaded, version: manifest.version! };
    }

    public async start(name: string, versionRange: string): Promise<{ port: MessagePortMain, version: string }> {
        const { plugin, version } = await this.load(name, versionRange);
        const port = new MessageChannelMain();
        const environment = new PluginEnvironment(this.wc, port.port1);

        await plugin.start(environment);

        return { port: port.port2, version };
    }

    public destroy() {
        this.wc.ipc.removeHandler("get-plugin-port");

        for (let { plugin } of this.loadedPlugins) {
            plugin.stop();
        }
    }
}
