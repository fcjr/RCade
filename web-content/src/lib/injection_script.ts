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

    const helloReply = await hello;

    manuallyLog("Port exchange finished", helloReply);

    window.parent.postMessage({ type: "SW_PORT_READY", content: helloReply }, "*", [messageChannel.port1]);

    function manuallyLogGame(level, ...message) {
        window.parent.postMessage({
            type: "WIN_LOG",
            content: {
                level: level,
                modules: [helloReply.game[2]],
                content: message.map(it => {
                    // check to see if content can be cloned with structuredClone
                    try {
                        window.parent.postMessage({ type: "__IGNORE", it });
                        return it
                    } catch(err) {
                        return String(it)
                    }
                }),
                time: Date.now(),
                id: crypto.randomUUID(),
                cause: undefined,
            }
        }, "*")
    }

    globalThis.console = {
        ...globalThis.console,

        log(...things) {
            manuallyLogGame("INFO", ...things)
        },

        info(...things) {
            manuallyLogGame("INFO", ...things)
        },

        debug(...things) {
            manuallyLogGame("DEBUG", ...things)
        },

        error(...things) {
            manuallyLogGame("ERROR", ...things)
        },

        warn(...things) {
            manuallyLogGame("WARN", ...things)
        },
    }
})();`;