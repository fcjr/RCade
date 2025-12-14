export const INJECT_SCRIPT = `
// Wrap getUserMedia to catch permission denials and notify parent
(function() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async function(constraints) {
        try {
            return await original(constraints);
        } catch (err) {
            if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
                const permission = constraints?.video ? 'camera' : constraints?.audio ? 'microphone' : 'media';
                window.parent.postMessage({ type: "PERMISSION_DENIED", permission }, "*");
            }
            throw err;
        }
    };
})();

(async () => {
    function manuallyLog(...content) {
        window.parent.postMessage({
            type: "WIN_LOG",
            content: {
                level: "DEBUG",
                modules: ["injection"],
                content,
                time: Date.now(),
                id: crypto.randomUUID(),
                cause: undefined,
            }
        }, "*")
    }

    manuallyLog("Ready");

    // Initialize communication port with service worker
    const registration = await navigator.serviceWorker.ready;

    manuallyLog("Service Worker Announced Ready");

    const sw = registration.active;
    const messageChannel = new MessageChannel();
    const hello = new Promise((resolve) => {
        const listener = (event) => {
            if (event.data && event.data.type === "PORT_INIT") {
                messageChannel.port1.removeEventListener("message", listener);
                resolve(event.data.content);
                return;
            }

            manuallyLog("Unknown message", event.data);
        };

        messageChannel.port1.addEventListener("message", listener);
        messageChannel.port1.start();
    });

    sw.postMessage({ type: "INIT_PORT" }, [messageChannel.port2]);

    const content = await hello;

    manuallyLog("Port exchange finished", content);

    window.parent.postMessage({ type: "SW_PORT_READY", content }, "*", [messageChannel.port1]);

    globalThis.console = {
        ...globalThis.console,

        log(...things) {
            window.parent.postMessage({
                type: "WIN_LOG",
                content: {
                    level: "INFO",
                    modules: [(content).game[2]],
                    content: things,
                    time: Date.now(),
                    id: crypto.randomUUID(),
                    cause: undefined,
                }
            }, "*")
        },

        info(...things) {
            window.parent.postMessage({
                type: "WIN_LOG",
                content: {
                    level: "INFO",
                    modules: [(content).game[2]],
                    content: things,
                    time: Date.now(),
                    id: crypto.randomUUID(),
                    cause: undefined,
                }
            }, "*")
        },

        debug(...things) {
            window.parent.postMessage({
                type: "WIN_LOG",
                content: {
                    level: "DEBUG",
                    modules: [(content).game[2]],
                    content: things,
                    time: Date.now(),
                    id: crypto.randomUUID(),
                    cause: undefined,
                }
            }, "*")
        },

        error(...things) {
            window.parent.postMessage({
                type: "WIN_LOG",
                content: {
                    level: "ERROR",
                    modules: [(content).game[2]],
                    content: things,
                    time: Date.now(),
                    id: crypto.randomUUID(),
                    cause: undefined,
                }
            }, "*")
        },

        warn(...things) {
            window.parent.postMessage({
                type: "WIN_LOG",
                content: {
                    level: "WARN",
                    modules: [(content).game[2]],
                    content: things,
                    time: Date.now(),
                    id: crypto.randomUUID(),
                    cause: undefined,
                }
            }, "*")
        },
    }
})();`;