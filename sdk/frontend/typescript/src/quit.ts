export type QuitOptions =
  | { type: "return-to-menu" }
  | { type: "error"; reason?: string };

export function quit(options: QuitOptions): never {
  // "*" because the parent is cross-origin on the web player (rcade.dev);
  // the default targetOrigin would silently drop the message there.
  window.parent.postMessage({ type: "quit", options }, "*");

  while (true) { }
}
