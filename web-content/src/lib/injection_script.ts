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

// Games (e.g. Godot exports with focusCanvas) can move focus into this iframe,
// which stops the parent page from seeing keyboard events. Forward them so the
// parent's input plugins keep working wherever focus lands. Only trusted events
// are forwarded, so re-dispatched PARENT_KEY events below don't echo back.
for (const kind of ["keydown", "keyup"]) {
    window.addEventListener(kind, (e) => {
        if (!e.isTrusted) return;
        window.parent.postMessage({ type: "WIN_KEY", kind, key: e.key, code: e.code, repeat: e.repeat }, "*");
    }, true);
}

// The reverse direction: browsers like Safari never move focus into this
// iframe (it can't be clicked), so games that read raw keyboard events would
// never hear the keyboard, and audio-unlock handlers would never run. The
// parent forwards its real key events here and we re-dispatch them on the
// game's canvas.
(function () {
    function legacyKeyCode(key, code) {
        if (code && code.startsWith("Key")) return code.charCodeAt(3);
        if (code && code.startsWith("Digit")) return code.charCodeAt(5);
        const map = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, " ": 32, Enter: 13, Escape: 27, Shift: 16, Control: 17, Alt: 18, Tab: 9, Backspace: 8 };
        if (key in map) return map[key];
        return key && key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
    }

    window.addEventListener("message", (e) => {
        if (e.source !== window.parent) return;
        const d = e.data;
        if (!d || d.type !== "PARENT_KEY") return;
        if (d.kind !== "keydown" && d.kind !== "keyup") return;

        const ev = new KeyboardEvent(d.kind, { key: d.key, code: d.code, repeat: d.repeat, bubbles: true, cancelable: true });
        const keyCode = legacyKeyCode(d.key, d.code);
        if (keyCode) {
            try {
                Object.defineProperty(ev, "keyCode", { get: () => keyCode });
                Object.defineProperty(ev, "which", { get: () => keyCode });
            } catch (err) {}
        }

        const target = document.querySelector("canvas") ?? document.body ?? window;
        target.dispatchEvent(ev);
    });
})();

(function () {
    const ua = navigator.userAgent;
    const isSafari = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg|OPR/.test(ua);
    const Orig = window.AudioContext || window.webkitAudioContext;
    if (!Orig) return;

    const contexts = [];

    function PatchedAudioContext(options) {
        // WebKit renders silence through AudioWorklets when an AudioContext is
        // created with an explicit sampleRate that differs from the output
        // device (e.g. Godot forces 44100 while Macs run at 48000). Engines
        // read the resulting ctx.sampleRate back and adapt, so on Safari we
        // drop the forced rate and let the context open at the device rate.
        if (isSafari && options && options.sampleRate !== undefined) {
            options = { ...options };
            delete options.sampleRate;
        }
        const ctx = options !== undefined ? new Orig(options) : new Orig();
        contexts.push(ctx);
        return ctx;
    }
    PatchedAudioContext.prototype = Orig.prototype;
    window.AudioContext = PatchedAudioContext;
    if (window.webkitAudioContext) window.webkitAudioContext = PatchedAudioContext;

    // Engines unlock audio with one-shot gesture listeners (Godot uses
    // { once: true }), so a single key event that lands without live user
    // activation consumes the unlock and leaves the game silent forever.
    // Retry on every input until the context actually runs.
    const resumeAll = () => {
        for (const ctx of contexts) {
            if (ctx.state === "suspended" || ctx.state === "interrupted") {
                ctx.resume().catch(() => {});
            }
        }
    };
    for (const ev of ["keydown", "mousedown", "touchstart"]) {
        window.addEventListener(ev, resumeAll, true);
    }
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

    // Game loading runs in the service worker but is driven over a
    // MessagePort, which doesn't count toward service worker lifetime -
    // browsers (Safari especially) kill the "idle" worker mid-download on
    // large games. These pings arrive as extendable message events the
    // worker uses to keep itself alive while a load is in flight.
    setInterval(() => {
        registration.active?.postMessage({ type: "KEEPALIVE" });
    }, 5000);

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