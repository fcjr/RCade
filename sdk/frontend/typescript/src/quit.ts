import z from "zod";

export type QuitOptions = z.input<typeof QuitOptionsSchema>

export const QuitOptionsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("return-to-menu") }),
  z.object({ type: z.literal("error"), reason: z.string().optional() })
])

export function quit(options: QuitOptions): never {
  // "*" because the parent is cross-origin on the web player (rcade.dev);
  // the default targetOrigin would silently drop the message there.
  window.parent.postMessage({ type: "quit", options }, "*");

  while (true) { }
}
