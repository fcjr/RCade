export const games = [
    {
        id: 'g_001',
        name: 'snake-evolved',
        git: { ssh: '...', https: '...' },
        owner_rc_id: 'rc_user_1',
        versions: [
            {
                displayName: 'Snake Evolved',
                description: 'Physics-based movement matrix. Survival mode active.',
                visibility: 'public',
                version: '2.1.0',
                authors: [{ display_name: 'Claire Froelich' }, { display_name: 'Jack Ratner' }],
                dependencies: [
                    { name: 'bevy', version: '0.12' },
                    { name: '@rcade/input-classic', version: '1.0.0' },
                    { name: '@rcade/marquee', version: '1.0.0' }
                ],
                categories: ['ARCADE', 'ACTION'],
                contents: { url: '/game-builds/snake.wasm', expires: 123456789 }
            }
        ]
    },
    {
        id: 'g_002',
        name: 'micro-engine',
        git: { ssh: '...', https: '...' },
        owner_rc_id: 'rc_user_2',
        versions: [
            {
                displayName: 'miRCo Engine',
                description: 'Fantasy console engine. Lua interpreter online.',
                visibility: 'public',
                version: '1.0.4',
                authors: [{ display_name: 'Greg Sadetsky' }, { display_name: 'Jonathan Rippy' }],
                dependencies: [
                    { name: '@rcade/input-keyboard', version: '1.0.0' },
                    { name: '@rcade/threads', version: '1.2.0' }
                ],
                categories: ['TOOLS', 'ENGINE'],
                contents: { url: '/game-builds/mirco.wasm', expires: 123456789 }
            }
        ]
    },
    {
        id: 'g_003',
        name: 'pixel-racer',
        git: { ssh: '...', https: '...' },
        owner_rc_id: 'rc_user_3',
        versions: [
            {
                displayName: 'Pixel Racer 2049',
                description: 'Anti-gravity racing protocol. Global sync enabled.',
                visibility: 'internal',
                version: '0.8.2-beta',
                authors: [{ display_name: 'SpeedDemon' }],
                dependencies: [
                    { name: 'godot', version: '4.2' },
                    { name: '@rcade/input-gamepad', version: '1.0.0' }
                ],
                categories: ['RACING', 'NET'],
                remixOf: { name: 'snake-evolved' }
            }
        ]
    },
    {
        id: 'g_004',
        name: 'void-drifter',
        git: { ssh: '...', https: '...' },
        owner_rc_id: 'rc_user_4',
        versions: [
            {
                displayName: 'Void Drifter',
                description: 'Minimalist puzzle. Zero-G environment simulation.',
                visibility: 'public',
                version: '1.0.0',
                authors: [{ display_name: 'ZenMaster' }],
                dependencies: [{ name: '@rcade/input-classic', version: '1.0.0' }],
                categories: ['PUZZLE', 'RELAX']
            }
        ]
    },
    {
        id: 'g_005',
        name: 'dungeon-crawler-js',
        git: { ssh: '...', https: '...' },
        owner_rc_id: 'rc_user_5',
        versions: [
            {
                displayName: 'Deep Dark DGN',
                description: 'Roguelike exploration. Vanilla JS kernel loaded.',
                visibility: 'private',
                version: '3.0.1',
                authors: [{ display_name: 'WebWizard' }],
                dependencies: [{ name: '@rcade/input-mouse', version: '1.0.0' }],
                categories: ['RPG', 'ROGUE']
            }
        ]
    }
];