import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";

export default class PluginSleep implements Plugin {
    private environment?: PluginEnvironment;
    private startHandler: any;
    private stopHandler: any;
    start(environment: PluginEnvironment): void {
        const port = environment.getPort();
        port.start();
        port.addListener("message", event => {
            if (event.data.type === "prevent_sleep") {
                environment.getWebContents().send("input-activity");
            }
            if (event.data.type === "update_screensaver") {
                environment.getWebContents().send("screensaver-config-changed", event.data.config);
            }
        })
        this.environment = environment;
        // @ts-ignore
        environment.getWebContents().ipc.addListener("screensaver-started", this.startHandler = () => {
            port.postMessage({ type: "screensaver_started" });
        });
        // @ts-ignore
        environment.getWebContents().ipc.addListener("screensaver-stopped", this.stopHandler = () => {
            port.postMessage({ type: "screensaver_stopped" });
        });
    }

    stop(): void {
        this.environment?.getWebContents().ipc.removeListener("screensaver-started", this.startHandler);
        this.environment?.getWebContents().ipc.removeListener("screensaver-stopped", this.stopHandler);
    }
}
