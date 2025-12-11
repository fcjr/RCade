<script lang="ts">
    import { RCadeWebEngine } from "@rcade/engine/src";
    import { onMount } from "svelte";

    let engine: RCadeWebEngine | null = null;

    async function initialize(cancellationToken: AbortSignal) {
        engine = await RCadeWebEngine.initialize(rcade, {
            appUrl: `${document.location.protocol}//${document.location.host}`,
            cancellationToken,
        });

        engine.register({
            getChannelName() {
                return "@rcade/input-classic";
            },

            getChannel(version) {
                writeLog(
                    `Creating input-classic channel for version ${version}...`,
                );

                const channel = new MessageChannel();

                channel.port2.onmessage = (event) => {
                    writeLog(
                        `Input Classic Channel Message: ${JSON.stringify(
                            event.data,
                        )}`,
                    );
                };

                return {
                    name: "@rcade/input-classic",
                    version: "1.0.0",
                    channel: channel.port1,
                };
            },
        });

        writeLog("RCade Web Engine initialized.");
    }

    function writeLog(message: string) {
        if (logs) {
            logs.innerText += message + "\n";
            logs.scrollTop = logs.scrollHeight;
        }
    }

    function sendCommand(command: string) {
        // parse command
        const [cmd, ...args] = command.split(" ");

        switch (cmd) {
            case "ping":
                writeLog("Pong!");
                break;
            case "load":
                if (engine) {
                    const gameId = args[0];
                    const version = args[1] || "latest";

                    writeLog(`Loading game ${gameId} version ${version}...`);

                    engine
                        .load(gameId, version)
                        .then((deets) => {
                            writeLog(
                                `Game ${JSON.stringify(deets)} successfully.`,
                            );
                        })
                        .catch((err) => {
                            writeLog(`Failed to load game: ${err}`);
                        });
                } else {
                    writeLog("Engine not initialized.");
                }
                break;
            case "unload":
                if (engine) {
                    writeLog("Unloading current game...");

                    engine
                        .unload()
                        .then(() => {
                            writeLog("Game successfully unloaded.");
                        })
                        .catch((err) => {
                            writeLog(`Failed to unload game: ${err}`);
                        });
                } else {
                    writeLog("Engine not initialized.");
                }
                break;
            default:
                writeLog(`Unknown command: ${cmd}`);
        }
    }

    onMount(() => {
        writeLog("Initializing RCade Web Engine...");

        let cancel = new AbortController();

        initialize(cancel.signal);

        return () => cancel.abort();
    });

    let rcade: HTMLDivElement;
    let logs: HTMLElement;
</script>

<div class="split-wrapper">
    <div class="gameWrapper">
        <div class="rcade" bind:this={rcade}></div>
    </div>
    <div class="log-wrapper">
        <h2>Log</h2>
        <div class="log-content">
            <code bind:this={logs}></code>
        </div>
        <div class="commandSender">
            <input
                type="text"
                placeholder="Enter command"
                on:keydown={(e) => {
                    if (e.key === "Enter" && engine) {
                        const command = (e.target as HTMLInputElement).value;
                        sendCommand(command);
                        (e.target as HTMLInputElement).value = "";
                    }
                }}
            />
        </div>
    </div>
</div>

<style>
    .gameWrapper {
        flex: none;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background-color: #121212;
    }

    .split-wrapper {
        display: flex;
        max-height: 100vh;
        max-width: 100vw;
        height: 100vh;
        width: 100vw;
        flex-direction: column;
    }

    .rcade {
        overflow: hidden;
        width: fit-content;
        border: 2px solid #444;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        display: flex;
    }

    .log-wrapper {
        flex: 1;
        background-color: #1e1e1e;
        color: #ffffff;
        display: flex;
        flex-direction: column;
    }

    .log-wrapper h2 {
        margin: 0;
        padding: 0.5rem;
        padding-left: 1rem;
        background-color: #333333;
        border-bottom: 1px solid #444444;
        font-family: monospace;
    }

    .log-content {
        flex: 1;
        padding: 1rem;
        overflow-y: auto;
        font-family: monospace;
        font-size: 0.9rem;
    }

    .commandSender {
        padding: 0.5rem;
        border-top: 1px solid #444444;
        background-color: #2a2a2a;
    }

    .commandSender input {
        width: 100%;
        padding: 0.5rem;
        border: none;
        border-radius: 4px;
        font-family: monospace;
        font-size: 1rem;
        background-color: #1e1e1e;
        color: #ffffff;
    }
</style>
