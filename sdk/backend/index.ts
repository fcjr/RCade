import type { MessagePortMain, WebContents } from "electron";

export class PluginEnvironment {
    constructor(
        private webContents: WebContents,
        private port: MessagePortMain,
    ) { }

    public getWebContents(): WebContents {
        return this.webContents;
    }

    public getPort(): MessagePortMain {
        return this.port;
    }
}

export interface Plugin {
    start(environment: PluginEnvironment): Promise<void> | void;
    stop(): Promise<void> | void;
}