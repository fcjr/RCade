interface ImportMeta {
    readonly hot?: {
        accept(cb?: (mod: unknown) => void): void;
        dispose(cb: () => void): void;
        invalidate(): void;
    };
}
