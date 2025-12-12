export function inject() {
    (async () => {
        // Initialize communication port with service worker
        const registration = await navigator.serviceWorker.ready;
        const sw = registration.active;
        const messageChannel = new MessageChannel();
        const hello = new Promise((resolve) => {
            const listener = (event: MessageEvent) => {
                if (event.data && event.data.type === "PORT_INIT") {
                    messageChannel.port1.removeEventListener("message", listener);
                    resolve(event.data.content);
                }
            };

            messageChannel.port1.addEventListener("message", listener);
            messageChannel.port1.start();
        });

        sw!.postMessage({ type: "INIT_PORT" }, [messageChannel.port2]);

        const content = await hello;

        window.parent.postMessage({ type: "SW_PORT_READY", content }, "*", [messageChannel.port1]);
    })()
}