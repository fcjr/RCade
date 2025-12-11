import type { Game, GameVersion } from "@rcade/api";

export function getCoverArt(game: GameVersion) {
    const thumbnail = game.thumbnailUrl();

    if (thumbnail) {
        return `background-image: url(${thumbnail}); background-size: cover; background-position: center;`;
    }

    const colors = ['#D24D57', '#2C3E50', '#e67e22', '#27ae60'];
    const c = colors[(game.displayName() ?? "").length % colors.length];
    return `
        background-color: ${c};
        background-image: 
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px);
        background-size: 20px 20px;
    `;
}

export function getCapabilities(dependencies: any[]) {
    const pluginMap: Record<string, string> = {
        '@rcade/input-classic': 'CLASSIC',
        '@rcade/input-spinners': 'SPINNERS',
    };
    return dependencies.map((d) => pluginMap[d.name] || d.name.toUpperCase()).filter(Boolean);
}

export function getVisConfig(visibility: "public" | "internal" | "private" | null | undefined) {
    switch (visibility) {
        case 'public':
            return { label: 'GLOBAL', class: 'vis-public', icon: '●' };
        case 'internal':
            return { label: 'HUB', class: 'vis-internal', icon: '▲' };
        case 'private':
            return { label: 'LOCAL', class: 'vis-private', icon: '■' };
        default:
            return { label: 'UNKNOWN', class: 'vis-unknown', icon: '?' };
    }
}