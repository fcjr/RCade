// ../../../../node_modules/.pnpm/@rcade+sdk@0.2.2_typescript@5.9.3/node_modules/@rcade/sdk/src/plugin_channel/index.ts
var PluginChannel = class _PluginChannel {
  constructor(port, channel) {
    this.port = port;
    this.channel = channel;
    this.port.addEventListener("message", (event) => {
      const { _nonce } = event.data ?? {};
      if (_nonce && this.pendingRequests.has(_nonce)) {
        const pending = this.pendingRequests.get(_nonce);
        this.pendingRequests.delete(_nonce);
        pending.resolve(event.data);
      }
    });
    this.port.start();
  }
  pendingRequests = /* @__PURE__ */ new Map();
  static async acquire(name, version) {
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return new Promise((resolve, reject) => {
      const listener = (event) => {
        if (event.data?.type === "plugin_channel" && event.data?.nonce === nonce) {
          const port = event.ports[0];
          if ("error" in event.data) {
            window.removeEventListener("message", listener);
            reject(new Error(event.data.error));
            return;
          }
          const { channel } = event.data;
          if (!channel?.name || !channel?.version || !port) {
            console.warn("Invalid plugin_channel event", event.data);
            return;
          }
          window.removeEventListener("message", listener);
          const pluginChannel = new _PluginChannel(port, channel);
          resolve(pluginChannel);
        }
      };
      window.addEventListener("message", listener);
      window.parent.postMessage({
        type: "acquire_plugin_channel",
        nonce,
        channel: { name, version }
      }, "*");
    });
  }
  // Utility method to access the message port
  getPort() {
    return this.port;
  }
  getVersion() {
    return String(this.channel.version);
  }
  /**
   * Send a request to the plugin and wait for a response.
   * The plugin must respond with a message containing the same `_nonce` field.
   */
  request(message, timeoutMs = 5e3) {
    const _nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(_nonce);
        reject(new Error("Request timed out"));
      }, timeoutMs);
      this.pendingRequests.set(_nonce, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
      this.port.postMessage({ ...message, _nonce });
    });
  }
};

// index.ts
var MarqueeHandle = class {
  constructor(channel, width, height) {
    this.channel = channel;
    this.width = width;
    this.height = height;
  }
  /**
   * Push a frame to the marquee. `frame` must be `width * height * 3` bytes
   * of raw RGB pixel data (row-major, no padding).
   *
   * If another game has taken the marquee after this one, the frame is held
   * by the plugin and displayed when this game becomes top of the stack again.
   */
  apply(frame) {
    const expected = this.width * this.height * 3;
    if (frame.length !== expected) {
      throw new Error(`marquee.apply: expected ${expected} bytes (${this.width}x${this.height}x3), got ${frame.length}`);
    }
    this.channel.getPort().postMessage({ type: "apply", frame });
  }
  /**
   * Set the display brightness. `value` is 0..=1 (0 off, 1 max).
   */
  setBrightness(value) {
    const clamped = Math.max(0, Math.min(1, value));
    const v = Math.round(clamped * 255);
    this.channel.getPort().postMessage({ type: "brightness", value: v });
  }
};
var acquired;
function getChannel() {
  if (!acquired) acquired = PluginChannel.acquire("@rcade/marquee", "^1.0.0");
  return acquired;
}
var MARQUEE_WIDTH = 128;
var MARQUEE_HEIGHT = 32;
var taken = false;
async function take() {
  if (taken) throw new Error("marquee.take: already taken by this game");
  taken = true;
  const channel = await getChannel();
  channel.getPort().postMessage({ type: "take", width: MARQUEE_WIDTH, height: MARQUEE_HEIGHT });
  return new MarqueeHandle(channel, MARQUEE_WIDTH, MARQUEE_HEIGHT);
}
var MARQUEE = { take };
export {
  MARQUEE,
  MarqueeHandle,
  take
};
