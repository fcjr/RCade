export function getCoverArt(name: string) {
    const colors = ['#D24D57', '#2C3E50', '#e67e22', '#27ae60'];
    const c = colors[name.length % colors.length];
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
        '@rcade/input-classic': 'ARCADEARCADEARCADE',
        '@rcade/input-gamepad': 'GAMEPAD',
        '@rcade/input-mouse': 'MOUSE',
        '@rcade/input-keyboard': 'KEYBOARD',
        '@rcade/threads': 'THREADS',
        '@rcade/marquee': 'MARQUEE'
    };
    return dependencies.map((d) => pluginMap[d.name] || d.name.toUpperCase()).filter(Boolean);
}

export function getVisConfig(visibility: string) {
    switch (visibility) {
        case 'public':
            return { label: 'GLOBAL', class: 'vis-public', icon: '●' };
        case 'internal':
            return { label: 'HUB', class: 'vis-internal', icon: '▲' };
        case 'private':
        default:
            return { label: 'LOCAL', class: 'vis-private', icon: '■' };
    }
}