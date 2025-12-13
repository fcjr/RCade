<script lang="ts">
    import BackgroundOverlay from "$lib/components/BackgroundOverlay.svelte";
    import { fly, fade, slide } from "svelte/transition";
    import { quartOut } from "svelte/easing";
    import { tick } from "svelte";

    const pagesData = [
        // --- ORIGINALS ---
        {
            gameName: "Neon Racer",
            id: "neon-racer",
            description: "High-speed pursuit in a digital void.",
            authors: [
                { name: "Kaito_Dev", role: "Code" },
                { name: "Vapor.Art", role: "Visuals" },
            ],
            categories: [
                { name: "racing", description: "" },
                { name: "arcade", description: "" },
            ],
            dependencies: [
                { name: "@rcade/input-classic" },
                { name: "@rcade/input-spinners" },
            ],
            history: ["1.0.0", "1.0.1", "1.0.2"],
        },
        {
            gameName: "Cyber Golf",
            id: "cyber-golf",
            description: "Physics-based putting in zero gravity.",
            authors: [{ name: "Orbit_Studio", role: "Dev" }],
            categories: [
                { name: "sport", description: "" },
                { name: "sim", description: "" },
                { name: "relax", description: "" },
            ],
            dependencies: [
                { name: "@rcade/physics-core" },
                { name: "@rcade/haptic-feedback" },
            ],
            history: ["1.5.0", "2.0.0", "2.1.0"],
        },
        {
            gameName: "Void Fighter",
            id: "void-fighter-ii",
            description: "1v1 combat at the edge of the universe.",
            authors: [
                { name: "Ryu_X", role: "Code" },
                { name: "Ken_Y", role: "Audio" },
            ],
            categories: [
                { name: "fighting", description: "" },
                { name: "multiplayer", description: "" },
            ],
            dependencies: [
                { name: "@rcade/net-play" },
                { name: "@rcade/input-stick" },
            ],
            history: ["0.8.0", "0.9.0", "0.9.5"],
        },
        {
            gameName: "Pixel Quest",
            id: "pixel-quest",
            description:
                "A tiny hero in a massive procedurally generated dungeon.",
            authors: [{ name: "Bit_Wizard", role: "Code" }],
            categories: [
                { name: "rpg", description: "" },
                { name: "roguelike", description: "" },
            ],
            dependencies: [
                { name: "@rcade/save-state" },
                { name: "@rcade/audio-8bit" },
            ],
            history: ["1.0", "2.0", "3.0.1"],
        },
        {
            gameName: "Hyper Core",
            id: "hyper-core-sys",
            description: "A system simulation with extensive update history.",
            authors: [{ name: "SysAdmin", role: "Root" }],
            categories: [
                { name: "sim", description: "" },
                { name: "complex", description: "" },
            ],
            dependencies: [
                { name: "@rcade/cpu-sim" },
                { name: "@rcade/net-bus" },
            ],
            history: [
                "0.1.0",
                "0.5.0",
                "1.0.0",
                "1.5.0",
                "2.0.0",
                "2.2.0-LATEST",
            ],
        },
        // --- ACTION / ARCADE ---
        {
            gameName: "Blast Radius",
            id: "blast-radius",
            description: "Defend the center core from incoming asteroids.",
            authors: [{ name: "Arcade_King", role: "Dev" }],
            categories: [
                { name: "shooter", description: "" },
                { name: "arcade", description: "" },
            ],
            dependencies: [{ name: "@rcade/input-classic" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Tank Battler 99",
            id: "tank-battler-99",
            description: "Top-down tank warfare in destructible mazes.",
            authors: [{ name: "Iron_Treads", role: "Code" }],
            categories: [
                { name: "action", description: "" },
                { name: "multiplayer", description: "" },
            ],
            dependencies: [
                { name: "@rcade/physics-2d" },
                { name: "@rcade/net-play" },
            ],
            history: ["0.5.0", "1.0.0"],
        },
        {
            gameName: "Sky Ace",
            id: "sky-ace",
            description: "Vertical scrolling shooter with biplanes.",
            authors: [{ name: "Prop_Head", role: "Dev" }],
            categories: [
                { name: "shmup", description: "" },
                { name: "arcade", description: "" },
            ],
            dependencies: [{ name: "@rcade/scroll-engine" }],
            history: ["1.0", "1.1", "1.2"],
        },
        {
            gameName: "Ninja Rush",
            id: "ninja-rush",
            description: "Infinite runner with shurikens.",
            authors: [{ name: "Shadow_Step", role: "Animation" }],
            categories: [
                { name: "platformer", description: "" },
                { name: "action", description: "" },
            ],
            dependencies: [{ name: "@rcade/anim-system" }],
            history: ["1.0.0", "1.0.5"],
        },
        {
            gameName: "Beat Street",
            id: "beat-street",
            description: "Side-scrolling brawler set in the 80s.",
            authors: [{ name: "Knuckles", role: "Design" }],
            categories: [
                { name: "beat-em-up", description: "" },
                { name: "retro", description: "" },
            ],
            dependencies: [{ name: "@rcade/input-gamepad" }],
            history: ["1.0.0"],
        },
        // --- PUZZLE / LOGIC ---
        {
            gameName: "Block Drop",
            id: "block-drop",
            description: "The classic falling block puzzle game.",
            authors: [{ name: "Logic_Bomb", role: "Code" }],
            categories: [
                { name: "puzzle", description: "" },
                { name: "classic", description: "" },
            ],
            dependencies: [{ name: "@rcade/grid-engine" }],
            history: ["1.0", "1.1", "1.2", "1.3"],
        },
        {
            gameName: "Gem Hunter",
            id: "gem-hunter",
            description: "Match 3 gems to explore the cave.",
            authors: [{ name: "Crystal_Clear", role: "Art" }],
            categories: [
                { name: "puzzle", description: "" },
                { name: "casual", description: "" },
            ],
            dependencies: [{ name: "@rcade/touch-input" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Sudoku Infinite",
            id: "sudoku-infinite",
            description: "Unlimited generated number puzzles.",
            authors: [{ name: "Math_Wiz", role: "Algo" }],
            categories: [
                { name: "puzzle", description: "" },
                { name: "brain", description: "" },
            ],
            dependencies: [{ name: "@rcade/number-gen" }],
            history: ["0.9.0", "1.0.0"],
        },
        {
            gameName: "Pipe Dreamer",
            id: "pipe-dreamer",
            description: "Connect the pipes before the water flows.",
            authors: [{ name: "Plumb_Co", role: "Dev" }],
            categories: [
                { name: "puzzle", description: "" },
                { name: "timed", description: "" },
            ],
            dependencies: [{ name: "@rcade/grid-engine" }],
            history: ["1.0.0", "1.1.0"],
        },
        {
            gameName: "Quantum Chess",
            id: "quantum-chess",
            description:
                "Chess where pieces can be in multiple squares at once.",
            authors: [{ name: "Schrodinger", role: "Design" }],
            categories: [
                { name: "strategy", description: "" },
                { name: "board", description: "" },
            ],
            dependencies: [{ name: "@rcade/ai-opponent" }],
            history: ["0.1a", "0.2a"],
        },
        // --- RPG / ADVENTURE ---
        {
            gameName: "Forest of Mana",
            id: "forest-of-mana",
            description: "Top-down action RPG in a cursed wood.",
            authors: [
                { name: "Green_Leaf", role: "Story" },
                { name: "Pixel_Forge", role: "Code" },
            ],
            categories: [
                { name: "rpg", description: "" },
                { name: "fantasy", description: "" },
            ],
            dependencies: [
                { name: "@rcade/save-system" },
                { name: "@rcade/dialogue-box" },
            ],
            history: ["1.0", "1.1"],
        },
        {
            gameName: "Space Merchant",
            id: "space-merchant",
            description: "Buy low, sell high across the galaxy.",
            authors: [{ name: "Credits_Inc", role: "Eco-Sim" }],
            categories: [
                { name: "sim", description: "" },
                { name: "sci-fi", description: "" },
            ],
            dependencies: [{ name: "@rcade/rng-market" }],
            history: ["1.0.0", "1.2.0", "1.5.0"],
        },
        {
            gameName: "Dungeon Clicker",
            id: "dungeon-clicker",
            description: "Kill monsters by clicking. Forever.",
            authors: [{ name: "Idle_Hands", role: "Dev" }],
            categories: [
                { name: "idle", description: "" },
                { name: "casual", description: "" },
            ],
            dependencies: [{ name: "@rcade/large-numbers" }],
            history: ["1.0", "2.0", "3.0", "4.0"],
        },
        {
            gameName: "The Noir Case",
            id: "noir-case",
            description: "Text-based detective mystery.",
            authors: [{ name: "Type_Writer", role: "Writer" }],
            categories: [
                { name: "adventure", description: "" },
                { name: "text", description: "" },
            ],
            dependencies: [{ name: "@rcade/text-parser" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Dragon Slayer",
            id: "dragon-slayer-x",
            description: "Turn-based battles against mythical beasts.",
            authors: [{ name: "Dice_Roller", role: "System" }],
            categories: [
                { name: "rpg", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [{ name: "@rcade/battle-engine" }],
            history: ["0.5", "1.0"],
        },
        // --- RACING / SPORTS ---
        {
            gameName: "Drift City",
            id: "drift-city",
            description: "Night time drifting with lo-fi beats.",
            authors: [{ name: "Tire_Smoke", role: "Physics" }],
            categories: [
                { name: "racing", description: "" },
                { name: "music", description: "" },
            ],
            dependencies: [
                { name: "@rcade/car-physics" },
                { name: "@rcade/audio-stream" },
            ],
            history: ["1.0.0", "1.0.1"],
        },
        {
            gameName: "Pixel Soccer",
            id: "pixel-soccer",
            description: "5v5 soccer with simple controls.",
            authors: [{ name: "Goal_Post", role: "Dev" }],
            categories: [
                { name: "sport", description: "" },
                { name: "multiplayer", description: "" },
            ],
            dependencies: [{ name: "@rcade/physics-2d" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Pro Bowling",
            id: "pro-bowling",
            description: "Realistic bowling simulation.",
            authors: [{ name: "Lane_Master", role: "Code" }],
            categories: [
                { name: "sport", description: "" },
                { name: "sim", description: "" },
            ],
            dependencies: [{ name: "@rcade/physics-3d" }],
            history: ["1.0", "1.1"],
        },
        {
            gameName: "Moto Xtreme",
            id: "moto-xtreme",
            description: "Dirt bike trials over impossible obstacles.",
            authors: [{ name: "Mud_Flap", role: "Dev" }],
            categories: [
                { name: "racing", description: "" },
                { name: "platformer", description: "" },
            ],
            dependencies: [{ name: "@rcade/bike-physics" }],
            history: ["0.8", "0.9", "1.0"],
        },
        {
            gameName: "Table Tennis VR",
            id: "table-tennis-vr",
            description: "Ping pong in virtual reality.",
            authors: [{ name: "VR_Vision", role: "Dev" }],
            categories: [
                { name: "sport", description: "" },
                { name: "vr", description: "" },
            ],
            dependencies: [
                { name: "@rcade/vr-headset" },
                { name: "@rcade/motion-controllers" },
            ],
            history: ["1.0.0"],
        },
        // --- HORROR / WEIRD ---
        {
            gameName: "Static Signal",
            id: "static-signal",
            description: "Find the frequency in the white noise.",
            authors: [{ name: "Ghost_In_Machine", role: "Audio" }],
            categories: [
                { name: "horror", description: "" },
                { name: "audio", description: "" },
            ],
            dependencies: [{ name: "@rcade/audio-proc" }],
            history: ["1.0"],
        },
        {
            gameName: "The Hallway",
            id: "the-hallway",
            description: "A walking simulator that never ends.",
            authors: [{ name: "Loop_Master", role: "Design" }],
            categories: [
                { name: "horror", description: "" },
                { name: "psychological", description: "" },
            ],
            dependencies: [{ name: "@rcade/3d-engine" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Glitch Garden",
            id: "glitch-garden",
            description: "Farming sim where the crops are corrupted data.",
            authors: [{ name: "Hex_Editor", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "experimental", description: "" },
            ],
            dependencies: [{ name: "@rcade/grid-engine" }],
            history: ["0.1", "0.2"],
        },
        // --- STRATEGY / SIM ---
        {
            gameName: "Ant Colony",
            id: "ant-colony",
            description: "Manage a hive of digital insects.",
            authors: [{ name: "Bio_Sim", role: "AI" }],
            categories: [
                { name: "sim", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [{ name: "@rcade/ai-swarm" }],
            history: ["1.0.0", "1.5.0"],
        },
        {
            gameName: "Tower Defense Z",
            id: "tower-defense-z",
            description: "Protect the base from zombies.",
            authors: [{ name: "Turret_Tech", role: "Code" }],
            categories: [
                { name: "strategy", description: "" },
                { name: "action", description: "" },
            ],
            dependencies: [{ name: "@rcade/pathfinding" }],
            history: ["1.0", "1.1", "1.2"],
        },
        {
            gameName: "City Planner 2000",
            id: "city-planner",
            description: "Build a metropolis from scratch.",
            authors: [{ name: "Urban_Dev", role: "Design" }],
            categories: [
                { name: "sim", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [{ name: "@rcade/eco-engine" }],
            history: ["1.0.0"],
        },
        {
            gameName: "Mars Base",
            id: "mars-base",
            description: "Survival strategy on the red planet.",
            authors: [{ name: "Red_Rock", role: "Dev" }],
            categories: [
                { name: "survival", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [{ name: "@rcade/resource-manager" }],
            history: ["0.5", "0.6", "0.7"],
        },
        // --- FILLER / MISC (To reach volume) ---
        {
            gameName: "Color Match",
            id: "color-match",
            description: "Simple color sorting game.",
            authors: [{ name: "Junior_Dev", role: "Learning" }],
            categories: [{ name: "casual", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Snake 3D",
            id: "snake-3d",
            description: "The classic snake game in a cube.",
            authors: [{ name: "Retro_Revive", role: "Dev" }],
            categories: [{ name: "arcade", description: "" }],
            dependencies: [{ name: "@rcade/3d-engine" }],
            history: ["1.0"],
        },
        {
            gameName: "Pong Clone",
            id: "pong-clone",
            description: "A legal tribute to the original.",
            authors: [{ name: "Law_Abiding", role: "Code" }],
            categories: [{ name: "classic", description: "" }],
            dependencies: [{ name: "@rcade/input-paddles" }],
            history: ["1.0"],
        },
        {
            gameName: "Rhythm Hero",
            id: "rhythm-hero",
            description: "Hit the notes to the beat.",
            authors: [{ name: "Audio_Surf", role: "Music" }],
            categories: [{ name: "rhythm", description: "" }],
            dependencies: [{ name: "@rcade/audio-sync" }],
            history: ["1.0", "2.0"],
        },
        {
            gameName: "Cooking Dash",
            id: "cooking-dash",
            description: "Prepare meals under pressure.",
            authors: [{ name: "Chef_Code", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "time-management", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Word Search",
            id: "word-search",
            description: "Find hidden words in the grid.",
            authors: [{ name: "Vocab_Labs", role: "Dev" }],
            categories: [{ name: "puzzle", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Solitaire",
            id: "solitaire-basic",
            description: "Standard Klondike Solitaire.",
            authors: [{ name: "Card_Shark", role: "Dev" }],
            categories: [{ name: "card", description: "" }],
            dependencies: [{ name: "@rcade/card-deck" }],
            history: ["1.0"],
        },
        {
            gameName: "Poker Night",
            id: "poker-night",
            description: "Texas Hold'em vs AI.",
            authors: [{ name: "Bluff_Master", role: "AI" }],
            categories: [
                { name: "card", description: "" },
                { name: "gambling", description: "" },
            ],
            dependencies: [{ name: "@rcade/card-deck" }],
            history: ["1.0"],
        },
        {
            gameName: "Blackjack",
            id: "blackjack-21",
            description: "Try to hit 21 without busting.",
            authors: [{ name: "Casino_Royale", role: "Dev" }],
            categories: [{ name: "card", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Checkers",
            id: "checkers-online",
            description: "Classic board game strategy.",
            authors: [{ name: "Board_Walk", role: "Dev" }],
            categories: [{ name: "board", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Ludo Star",
            id: "ludo-star",
            description: "Family board game fun.",
            authors: [{ name: "Dice_Games", role: "Dev" }],
            categories: [{ name: "board", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Minesweeper X",
            id: "minesweeper-x",
            description: "Don't click on the bombs.",
            authors: [{ name: "Win_95", role: "Inspo" }],
            categories: [{ name: "puzzle", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Fishing Sim",
            id: "fishing-sim",
            description: "Relax by the digital lake.",
            authors: [{ name: "Reel_Time", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "relax", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Hunting Season",
            id: "hunting-season",
            description: "Track wild game in the forest.",
            authors: [{ name: "Outdoor_Games", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "shooter", description: "" },
            ],
            dependencies: [{ name: "@rcade/3d-forest" }],
            history: ["1.0"],
        },
        {
            gameName: "Train Conductor",
            id: "train-conductor",
            description: "Keep the trains running on time.",
            authors: [{ name: "Rail_Road", role: "Dev" }],
            categories: [{ name: "sim", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Flight School",
            id: "flight-school",
            description: "Learn to fly a Cessna.",
            authors: [{ name: "Aero_Dyna", role: "Physics" }],
            categories: [{ name: "sim", description: "" }],
            dependencies: [{ name: "@rcade/flight-physics" }],
            history: ["1.0"],
        },
        {
            gameName: "Submarine Commander",
            id: "submarine-commander",
            description: "Deep sea exploration and combat.",
            authors: [{ name: "Sonar_Ping", role: "Audio" }],
            categories: [
                { name: "sim", description: "" },
                { name: "action", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Alien Invasion",
            id: "alien-invasion",
            description: "They came from above.",
            authors: [{ name: "X_Files", role: "Story" }],
            categories: [{ name: "action", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Zombie Run",
            id: "zombie-run",
            description: "Run from the horde.",
            authors: [{ name: "Undead_Dev", role: "Code" }],
            categories: [
                { name: "horror", description: "" },
                { name: "runner", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Vampire Hunter",
            id: "vampire-hunter",
            description: "Slay vampires in a gothic castle.",
            authors: [{ name: "Belmont_Fan", role: "Dev" }],
            categories: [
                { name: "action", description: "" },
                { name: "platformer", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Werewolf Village",
            id: "werewolf-village",
            description: "Find the werewolf among the villagers.",
            authors: [{ name: "Social_Deduction", role: "Design" }],
            categories: [
                { name: "multiplayer", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Cyber Hacker",
            id: "cyber-hacker",
            description: "Breach the mainframe.",
            authors: [{ name: "Script_Kiddie", role: "Dev" }],
            categories: [
                { name: "puzzle", description: "" },
                { name: "sim", description: "" },
            ],
            dependencies: [{ name: "@rcade/terminal" }],
            history: ["1.0"],
        },
        {
            gameName: "Robot Wars",
            id: "robot-wars",
            description: "Build and fight custom bots.",
            authors: [{ name: "Mecha_Eng", role: "Dev" }],
            categories: [
                { name: "action", description: "" },
                { name: "building", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Dino Park",
            id: "dino-park",
            description: "Manage a prehistoric zoo.",
            authors: [{ name: "Amber_Mosquito", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "strategy", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Super Jump Man",
            id: "super-jump-man",
            description: "Jump on turtles and save the princess.",
            authors: [{ name: "Plumber_Bro", role: "Dev" }],
            categories: [{ name: "platformer", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Mega Blaster",
            id: "mega-blaster",
            description: "Blue robot shoots lemons.",
            authors: [{ name: "Rock_Roll", role: "Dev" }],
            categories: [
                { name: "platformer", description: "" },
                { name: "action", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Pocket Monster",
            id: "pocket-monster",
            description: "Catch them all.",
            authors: [{ name: "Ball_Thrower", role: "Dev" }],
            categories: [{ name: "rpg", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Final Fantasy X-2",
            id: "final-fantasy-clone",
            description: "Spiky hair and big swords.",
            authors: [{ name: "JRPG_Lover", role: "Dev" }],
            categories: [{ name: "rpg", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Kingdom Hearts Clone",
            id: "kingdom-hearts-clone",
            description: "Keys and darkness.",
            authors: [{ name: "Disney_Fan", role: "Dev" }],
            categories: [
                { name: "action", description: "" },
                { name: "rpg", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Metal Gear Solidish",
            id: "metal-gear-solidish",
            description: "Tactical espionage action.",
            authors: [{ name: "Box_Hider", role: "Dev" }],
            categories: [{ name: "stealth", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Silent Hillish",
            id: "silent-hillish",
            description: "Foggy town with scary nurses.",
            authors: [{ name: "Fog_Machine", role: "Dev" }],
            categories: [{ name: "horror", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Resident Evilish",
            id: "resident-evilish",
            description: "Mansion with zombies and puzzles.",
            authors: [{ name: "Herb_Mixer", role: "Dev" }],
            categories: [
                { name: "horror", description: "" },
                { name: "survival", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Grand Theft Autoish",
            id: "gta-clone",
            description: "Open world crime simulator.",
            authors: [{ name: "Crime_Lord", role: "Dev" }],
            categories: [
                { name: "action", description: "" },
                { name: "open-world", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Call of Dutyish",
            id: "cod-clone",
            description: "Modern warfare shooter.",
            authors: [{ name: "Trigger_Happy", role: "Dev" }],
            categories: [{ name: "fps", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Battlefieldish",
            id: "battlefield-clone",
            description: "Large scale warfare with vehicles.",
            authors: [{ name: "Tank_Driver", role: "Dev" }],
            categories: [{ name: "fps", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Overwatchish",
            id: "overwatch-clone",
            description: "Hero shooter with abilities.",
            authors: [{ name: "Hero_Maker", role: "Dev" }],
            categories: [
                { name: "fps", description: "" },
                { name: "multiplayer", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Fortniteish",
            id: "fortnite-clone",
            description: "Battle royale with building.",
            authors: [{ name: "Bus_Driver", role: "Dev" }],
            categories: [{ name: "battle-royale", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "PUBGish",
            id: "pubg-clone",
            description: "Realistic battle royale.",
            authors: [{ name: "Pan_Man", role: "Dev" }],
            categories: [{ name: "battle-royale", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Apex Legendsish",
            id: "apex-clone",
            description: "Fast paced battle royale.",
            authors: [{ name: "Slide_Jump", role: "Dev" }],
            categories: [{ name: "battle-royale", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Valorantish",
            id: "valorant-clone",
            description: "Tactical shooter with magic.",
            authors: [{ name: "Corner_Peaker", role: "Dev" }],
            categories: [{ name: "fps", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "CS:GOish",
            id: "csgo-clone",
            description: "Terrorists vs Counter-Terrorists.",
            authors: [{ name: "Bomb_Planter", role: "Dev" }],
            categories: [{ name: "fps", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Rocket Leagueish",
            id: "rocket-league-clone",
            description: "Cars playing soccer.",
            authors: [{ name: "Boost_Pad", role: "Dev" }],
            categories: [
                { name: "sport", description: "" },
                { name: "racing", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Fall Guysish",
            id: "fall-guys-clone",
            description: "Obstacle course battle royale.",
            authors: [{ name: "Bean_Man", role: "Dev" }],
            categories: [{ name: "party", description: "" }],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Among Usish",
            id: "among-us-clone",
            description: "Find the imposter in space.",
            authors: [{ name: "Sus_Guy", role: "Dev" }],
            categories: [
                { name: "party", description: "" },
                { name: "social", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Stardew Valleyish",
            id: "stardew-clone",
            description: "Farming and relationships.",
            authors: [{ name: "Crop_Waterer", role: "Dev" }],
            categories: [
                { name: "sim", description: "" },
                { name: "rpg", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Terrariaish",
            id: "terraria-clone",
            description: "2D Minecraft with bosses.",
            authors: [{ name: "Digger_Dan", role: "Dev" }],
            categories: [
                { name: "sandbox", description: "" },
                { name: "adventure", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
        {
            gameName: "Minecraftish",
            id: "minecraft-clone",
            description: "Blocks and creepers.",
            authors: [{ name: "Notch_Fan", role: "Dev" }],
            categories: [
                { name: "sandbox", description: "" },
                { name: "survival", description: "" },
            ],
            dependencies: [],
            history: ["1.0"],
        },
    ];

    // --- FILTER LOGIC ---
    const uniqueTags = [
        ...new Set(pagesData.flatMap((p) => p.categories.map((c) => c.name))),
    ].sort();
    let selectedTags: string[] = [];
    let filterCursorIndex = 0;

    $: filteredPages =
        selectedTags.length === 0
            ? pagesData
            : pagesData.filter((p) =>
                  p.categories.some((c) => selectedTags.includes(c.name)),
              );

    $: totalPages = filteredPages.length;

    // --- NAVIGATION STATE ---
    let activePage = 0;
    let activeVersionIndex = 0;
    let direction = 1;
    let viewportState: "neutral" | "show-top" | "show-bottom" = "neutral";

    let versionsContainer: HTMLDivElement;
    let filtersContainer: HTMLDivElement;
    let paginationContainer: HTMLDivElement;

    // Mask Variables
    let maskLeftSize = "0px";
    let maskRightSize = "0px";
    let filterMaskLeft = "0px";
    let filterMaskRight = "0px";

    // Pagination specific variables
    let paginationMaskLeft = "0px";
    let paginationMaskRight = "0px";
    let pagesHiddenLeft = 0;
    let pagesHiddenRight = 0;

    $: current = filteredPages[activePage];

    // RESET LOGIC
    let lastGameId = "";
    $: if (current && current.id !== lastGameId) {
        lastGameId = current.id;
        activeVersionIndex = current.history.length - 1;

        if (viewportState === "show-bottom") {
            tick().then(() => {
                triggerScroll(
                    versionsContainer,
                    activeVersionIndex,
                    true,
                    updateVersionMasks,
                );
            });
        }
    }

    // --- PAGINATION SYNC ---
    // Auto-scroll the pagination dots when activePage changes
    $: if (paginationContainer && activePage >= 0) {
        // Use tick to ensure DOM is ready if page count changed
        tick().then(() => {
            triggerScroll(
                paginationContainer,
                activePage,
                false,
                updatePaginationState,
            );
        });
    }

    // --- SCROLL UTILS ---
    function updateVersionMasks() {
        if (!versionsContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = versionsContainer;
        maskLeftSize = scrollLeft > 10 ? "20px" : "0px";
        maskRightSize =
            scrollWidth - clientWidth - scrollLeft > 10 ? "20px" : "0px";
    }

    function updateFilterMasks() {
        if (!filtersContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = filtersContainer;
        filterMaskLeft = scrollLeft > 10 ? "20px" : "0px";
        filterMaskRight =
            scrollWidth - clientWidth - scrollLeft > 10 ? "20px" : "0px";
    }

    function updatePaginationState() {
        if (!paginationContainer) return;
        const { scrollLeft, scrollWidth, clientWidth } = paginationContainer;

        // Update visual masks (mask logic is fine)
        paginationMaskLeft = scrollLeft > 5 ? "30px" : "0px";
        paginationMaskRight =
            scrollWidth - clientWidth - scrollLeft > 5 ? "30px" : "0px";

        // --- NEW LOGIC HERE ---
        if (scrollWidth <= clientWidth) {
            // If content fits without scrolling, reset both counters and exit.
            pagesHiddenLeft = 0;
            pagesHiddenRight = 0;
            return;
        }

        // Calculate hidden items count only if scrolling is required
        const children = Array.from(
            paginationContainer.children,
        ) as HTMLElement[];

        // The thresholds are correct for a scrolling container:
        // leftThreshold is the left edge of the visible window
        // rightThreshold is the right edge of the visible window
        const leftThreshold = scrollLeft;
        const rightThreshold = scrollLeft + clientWidth;

        let leftCount = 0;
        let rightCount = 0;

        children.forEach((child) => {
            const childCenter = child.offsetLeft + child.offsetWidth / 2;
            if (childCenter < leftThreshold) leftCount++;
            if (childCenter > rightThreshold) rightCount++;
        });

        pagesHiddenLeft = leftCount;
        pagesHiddenRight = rightCount;
    }

    let scrollFrame: number;

    function tweenScroll(
        container: HTMLElement,
        target: number,
        callback: () => void,
    ) {
        if (scrollFrame) cancelAnimationFrame(scrollFrame);

        const start = container.scrollLeft;
        const dist = target - start;
        const duration = 200;
        const startTime = performance.now();
        const ease = (t: number) => 1 - Math.pow(1 - t, 4);

        function step(currentTime: number) {
            const elapsed = currentTime - startTime;
            if (elapsed >= duration) {
                container.scrollLeft = target;
                callback();
                return;
            }
            const progress = ease(elapsed / duration);
            container.scrollLeft = start + dist * progress;
            callback();
            scrollFrame = requestAnimationFrame(step);
        }
        scrollFrame = requestAnimationFrame(step);
    }

    function triggerScroll(
        container: HTMLElement,
        targetIndex: number,
        instant: boolean,
        updateFn: () => void,
    ) {
        if (
            !container ||
            !container.children ||
            !container.children[targetIndex]
        )
            return;

        const targetEl = container.children[targetIndex] as HTMLElement;
        const containerCenter = container.clientWidth / 2;
        const elCenter = targetEl.offsetLeft + targetEl.offsetWidth / 2;

        const maxScroll = container.scrollWidth - container.clientWidth;
        let targetScroll = elCenter - containerCenter;

        if (maxScroll > 0) {
            targetScroll = Math.max(0, Math.min(targetScroll, maxScroll));
        } else {
            targetScroll = 0;
        }

        if (instant) {
            if (scrollFrame) cancelAnimationFrame(scrollFrame);
            container.scrollLeft = targetScroll;
            updateFn();
        } else {
            tweenScroll(container, targetScroll, updateFn);
        }
    }

    function setPage(index: number) {
        if (index === activePage) return;
        direction = index > activePage ? 1 : -1;
        activePage = index;
    }

    function toggleFilter(tag: string) {
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter((t) => t !== tag);
        } else {
            selectedTags = [...selectedTags, tag];
        }
        activePage = 0;
        // Reset pagination scroll when filters change
        tick().then(updatePaginationState);
    }

    function getDepLabel(name: string) {
        return name;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (viewportState === "show-top") {
                viewportState = "neutral";
            } else if (current) {
                viewportState = "show-bottom";
                tick().then(() =>
                    triggerScroll(
                        versionsContainer,
                        activeVersionIndex,
                        true,
                        updateVersionMasks,
                    ),
                );
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (viewportState === "show-bottom") {
                viewportState = "neutral";
            } else {
                viewportState = "show-top";
                tick().then(() =>
                    triggerScroll(
                        filtersContainer,
                        filterCursorIndex,
                        true,
                        updateFilterMasks,
                    ),
                );
            }
        }

        if (e.key === "Enter" && viewportState === "show-top") {
            e.preventDefault();
            toggleFilter(uniqueTags[filterCursorIndex]);
        }

        if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (viewportState === "show-bottom" && current) {
                const newIndex = Math.max(0, activeVersionIndex - 1);
                activeVersionIndex = newIndex;
                triggerScroll(
                    versionsContainer,
                    activeVersionIndex,
                    false,
                    updateVersionMasks,
                );
            } else if (viewportState === "show-top") {
                const newIndex = Math.max(0, filterCursorIndex - 1);
                filterCursorIndex = newIndex;
                triggerScroll(
                    filtersContainer,
                    filterCursorIndex,
                    false,
                    updateFilterMasks,
                );
            } else {
                const newPage = Math.max(0, activePage - 1);
                if (newPage !== activePage) setPage(newPage);
            }
        } else if (e.key === "ArrowRight") {
            e.preventDefault();
            if (viewportState === "show-bottom" && current) {
                const newIndex = Math.min(
                    current.history.length - 1,
                    activeVersionIndex + 1,
                );
                activeVersionIndex = newIndex;
                triggerScroll(
                    versionsContainer,
                    activeVersionIndex,
                    false,
                    updateVersionMasks,
                );
            } else if (viewportState === "show-top") {
                const newIndex = Math.min(
                    uniqueTags.length - 1,
                    filterCursorIndex + 1,
                );
                filterCursorIndex = newIndex;
                triggerScroll(
                    filtersContainer,
                    filterCursorIndex,
                    false,
                    updateFilterMasks,
                );
            } else {
                const newPage = Math.min(totalPages - 1, activePage + 1);
                if (newPage !== activePage) setPage(newPage);
            }
        }
    }
</script>

<svelte:window
    on:keydown={handleKeydown}
    on:resize={() => {
        updateVersionMasks();
        updateFilterMasks();
        updatePaginationState();
    }}
/>

<main>
    <div
        class="shifting-viewport"
        class:show-top={viewportState === "show-top"}
        class:show-bottom={viewportState === "show-bottom"}
    >
        <div class="filter-drawer">
            <div class="drawer-header">FILTER_SYSTEM</div>
            <div class="drawer-sub">Use ARROWS to nav, ENTER to toggle</div>

            <div
                class="chips-container"
                bind:this={filtersContainer}
                on:scroll={updateFilterMasks}
                style="--mask-left: {filterMaskLeft}; --mask-right: {filterMaskRight};"
            >
                {#each uniqueTags as tag, i}
                    <div
                        class="version-chip filter-chip"
                        class:cursor-active={i === filterCursorIndex}
                        class:selected={selectedTags.includes(tag)}
                        on:click={() => {
                            filterCursorIndex = i;
                            toggleFilter(tag);
                        }}
                        role="button"
                        tabindex="0"
                    >
                        <span class="filter-check"
                            >[{selectedTags.includes(tag) ? "X" : " "}]</span
                        >
                        <span class="chip-text">#{tag}</span>
                    </div>
                {/each}
            </div>
        </div>

        <div class="bg-layer">
            <div style="width:100%; height:100%; background: #111;"></div>
            <BackgroundOverlay />
        </div>

        <div class="ui-layer">
            {#if selectedTags.length > 0}
                <div
                    class="filter-hud-static"
                    transition:slide|local={{ duration: 250, axis: "y" }}
                >
                    <div class="hud-inner">
                        <span class="hud-icon">FILTER_SYSTEM :: ACTIVE</span>
                        <span class="hud-msg"
                            >Use <span class="key">▲</span> to modify</span
                        >
                    </div>
                </div>
            {/if}
            {#if current}
                <div class="top-section">
                    <div class="pagination-wrapper">
                        <div
                            class="pagination-counter left"
                            class:visible={pagesHiddenLeft > 0}
                        >
                            +{pagesHiddenLeft}
                        </div>

                        <div
                            class="pagination-scroll"
                            bind:this={paginationContainer}
                            on:scroll={updatePaginationState}
                            style="--mask-left: {paginationMaskLeft}; --mask-right: {paginationMaskRight};"
                        >
                            {#each Array(totalPages) as _, i}
                                <div
                                    class="dot"
                                    class:active={i === activePage}
                                    on:click={() => setPage(i)}
                                    role="button"
                                    tabindex="0"
                                ></div>
                            {/each}
                        </div>

                        <div
                            class="pagination-counter right"
                            class:visible={pagesHiddenRight > 0}
                        >
                            +{pagesHiddenRight}
                        </div>
                    </div>

                    {#if current.categories.length > 0}
                        <div class="category-strip">
                            {#each current.categories as category}
                                <span class="category-tag">
                                    <span class="tag-hash">#</span
                                    >{category.name}
                                </span>
                            {/each}
                        </div>
                    {/if}
                </div>

                <div class="content-stage">
                    {#key current.id}
                        <div
                            class="slide-container"
                            in:fly={{
                                x: 10 * direction,
                                duration: 150,
                                delay: 0,
                                easing: quartOut,
                            }}
                            out:fly={{
                                x: -10 * direction,
                                duration: 150,
                                easing: quartOut,
                            }}
                        >
                            <div class="bottom-section">
                                <div class="header-group">
                                    <div class="meta-line">
                                        <span class="meta-id">{current.id}</span
                                        >
                                        <span class="meta-slash">/</span>
                                        <span class="meta-ver"
                                            >v{current.history[
                                                activeVersionIndex
                                            ] || "---"}</span
                                        >
                                    </div>
                                    <h1 class="game-title">
                                        {current.gameName}
                                    </h1>
                                    <p class="game-desc">
                                        {current.description}
                                    </p>
                                </div>

                                <div class="data-grid">
                                    <div class="grid-row">
                                        <div class="grid-label">AUTHORS</div>
                                        <div
                                            class="grid-content authors-content"
                                        >
                                            {#each current.authors as author}
                                                <div class="data-entry">
                                                    <span class="entry-main"
                                                        >{author.name}</span
                                                    >
                                                </div>
                                            {/each}
                                        </div>
                                    </div>

                                    <div class="grid-row">
                                        <div class="grid-label">PLUGINS</div>
                                        <div class="grid-content">
                                            {#each current.dependencies as dep}
                                                <div class="data-entry">
                                                    <span class="entry-main"
                                                        >{getDepLabel(
                                                            dep.name,
                                                        )}</span
                                                    >
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    {/key}
                </div>
            {:else}
                <div class="empty-state">
                    <span>NO_RESULTS_FOUND</span>
                </div>
            {/if}
        </div>

        {#if current}
            <div class="version-drawer">
                <div class="drawer-header">VERSION_HISTORY</div>
                <div
                    class="chips-container"
                    bind:this={versionsContainer}
                    on:scroll={updateVersionMasks}
                    style="--mask-left: {maskLeftSize}; --mask-right: {maskRightSize};"
                >
                    {#each current.history as ver, i}
                        <div
                            class="version-chip"
                            class:current={i === activeVersionIndex}
                            on:click={() => {
                                activeVersionIndex = i;
                                triggerScroll(
                                    versionsContainer,
                                    i,
                                    false,
                                    updateVersionMasks,
                                );
                            }}
                            role="button"
                            tabindex="0"
                        >
                            <span class="chip-text">{ver}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
</main>

<style>
    :root {
        --color-primary: #facc15;
        --color-text-primary: #ffffff;
        --color-text-secondary: rgba(255, 255, 255, 0.6);
        --drawer-height: 70px;
        --filter-drawer-height: 90px;

        --font-display: "Syne", sans-serif;
        --font-body: "DM Sans", sans-serif;
        --font-mono: "JetBrains Mono", monospace;

        --ease-snappy: cubic-bezier(0.165, 0.84, 0.44, 1);
    }

    main {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background-color: #000;
        font-family: var(--font-body);
        color: var(--color-text-primary);
    }

    .shifting-viewport {
        position: relative;
        width: 100%;
        height: 100%;
        will-change: transform;
        transition: transform 0.3s var(--ease-snappy);
    }

    .shifting-viewport.show-bottom {
        transform: translateY(calc(var(--drawer-height) * -1));
    }
    .shifting-viewport.show-top {
        transform: translateY(var(--filter-drawer-height));
    }

    .bg-layer {
        position: absolute;
        inset: 0;
        z-index: 0;
        opacity: 0.5;
    }

    .ui-layer {
        position: relative;
        z-index: 1;
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        padding-bottom: 16px;
        box-sizing: border-box;
    }

    .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--font-mono);
        color: var(--color-primary);
        letter-spacing: 0.1em;
    }

    .version-drawer,
    .filter-drawer {
        position: absolute;
        left: 0;
        width: 100%;
        background: #000;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;
        padding: 0;
        box-sizing: border-box;
        gap: 6px;
    }

    .version-drawer {
        top: 100%;
        height: var(--drawer-height);
        border-top: 1px solid rgba(255, 255, 255, 0.15);
    }

    .filter-drawer {
        bottom: 100%;
        height: var(--filter-drawer-height);
        border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }

    .drawer-header {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: var(--color-primary);
        letter-spacing: 0.05em;
        opacity: 1;
        text-transform: uppercase;
        padding-left: 16px;
    }
    .drawer-header::before {
        content: ">_ ";
        opacity: 0.5;
    }

    .drawer-sub {
        font-family: var(--font-mono);
        font-size: 0.35rem;
        color: #555;
        padding-left: 16px;
        margin-top: -4px;
        margin-bottom: 2px;
    }

    .chips-container {
        display: flex;
        gap: 8px;
        width: 100%;
        overflow-x: auto;
        scrollbar-width: none;
        padding: 0 16px;
        box-sizing: border-box;

        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
    }

    .chips-container::-webkit-scrollbar {
        display: none;
    }

    .version-chip {
        height: 22px;
        padding: 0 8px;
        flex-shrink: 0;
        border-radius: 0px;
        background: #111;
        border: 1px solid #333;
        display: flex;
        align-items: center;
        font-family: var(--font-mono);
        font-size: 0.55rem;
        color: #888;
        cursor: pointer;
        transition: all 0.1s ease;
        white-space: nowrap;
    }

    .version-chip:hover {
        background: #222;
        color: #fff;
        border-color: #555;
    }

    .version-chip.current {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: #000;
        font-weight: 700;
    }

    .filter-check {
        margin-right: 6px;
        opacity: 0.5;
        font-weight: 400;
    }

    .filter-chip.cursor-active {
        border-color: #fff;
        background: #222;
        color: #fff;
    }

    .filter-chip.selected {
        background: rgba(250, 204, 21, 0.15);
        color: var(--color-primary);
        border-color: rgba(250, 204, 21, 0.5);
    }

    .filter-chip.cursor-active.selected {
        background: var(--color-primary);
        color: #000;
        border-color: var(--color-primary);
    }
    .filter-chip.cursor-active.selected .filter-check {
        opacity: 1;
        color: #000;
    }

    .top-section {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        margin-bottom: auto;
        padding: 0 16px;
        box-sizing: border-box;
    }

    .content-stage {
        flex: 1;
        display: grid;
        grid-template-areas: "stack";
        align-items: end;
        overflow: hidden;
        width: 100%;
    }

    .slide-container {
        grid-area: stack;
        width: 100%;
    }

    .bottom-section {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0 16px;
        box-sizing: border-box;
    }

    /* --- PAGINATION NEW STYLES --- */
    .pagination-wrapper {
        position: relative;
        width: 100%;
        max-width: 300px; /* Constrain width to force scrolling on many dots */
        margin-bottom: 16px;
        margin-top: 16px;
        overflow: visible;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-top: -40px;
        margin-bottom: -40px;
    }

    .pagination-scroll {
        padding-top: 50px;
        padding-bottom: 50px;
        padding-left: 14px;
        padding-right: 14px;

        display: flex;
        align-items: center;
        gap: 6px;
        overflow-x: auto;
        overflow-y: visible;
        scrollbar-width: none;
        width: fit-content;

        box-sizing: border-box;
        /* Mask logic same as version chips */
        mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
        -webkit-mask-image: linear-gradient(
            to right,
            transparent 0px,
            black var(--mask-left),
            black calc(100% - var(--mask-right)),
            transparent 100%
        );
    }

    .pagination-scroll::-webkit-scrollbar {
        display: none;
    }

    .pagination-counter {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        font-family: var(--font-mono);
        font-size: 0.5rem;
        color: #fff;
        font-weight: bold;
        pointer-events: none; /* Let clicks pass through */
        opacity: 0;
        transition: opacity 0.2s ease;
        z-index: 10;
        text-shadow: 0 0 4px #000;
    }

    .pagination-counter.visible {
        opacity: 1;
    }

    .pagination-counter.left {
        left: 0;
    }
    .pagination-counter.right {
        right: 0;
    }

    .dot {
        width: 3px;
        height: 3px;
        flex-shrink: 0; /* Prevent shrinking */
        border-radius: 50%;
        background-color: rgba(255, 255, 255, 0.2);
        transition: all 0.3s;
        cursor: pointer;
    }

    .dot:hover {
        background-color: rgba(255, 255, 255, 0.5);
    }

    .dot.active {
        background-color: var(--color-primary);
        transform: scale(1.5);
        box-shadow:
            0 0 6px var(--color-primary),
            0 0 10px var(--color-primary);
    }

    /* Fix flex behavior for scroll centering trick: 
       To center when few items, but scroll left-align when many, 
       we use margin: auto on the first/last elements or justify-content logic. 
       Since we use mask, simple left align usually looks best for scrollable strips.
    */

    .category-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        justify-content: center;
    }

    .category-tag {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: rgba(255, 255, 255, 0.5);
        font-family: var(--font-mono);
        font-size: 0.5rem;
        text-transform: uppercase;
        font-weight: 500;
        line-height: 1;
        letter-spacing: 0.02em;
        transition: all 0.2s ease;
        cursor: default;
    }

    .tag-hash {
        color: var(--color-primary);
        margin-right: 4px;
        opacity: 0.4;
        font-size: 0.9em;
    }

    .header-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .meta-line {
        font-family: var(--font-mono);
        font-size: 0.45rem;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.5);
        display: flex;
        gap: 4px;
        align-items: center;
    }
    .meta-slash {
        color: var(--color-primary);
        font-weight: bold;
    }
    .meta-ver {
        opacity: 0.5;
        transition: opacity 0.2s;
    }

    .game-title {
        margin: 0;
        font-family: var(--font-display);
        font-size: 1.6rem;
        line-height: 0.95;
        font-weight: 800;
        letter-spacing: -0.02em;
        color: white;
    }

    .game-desc {
        margin: 0;
        margin-top: 4px;
        font-size: 0.65rem;
        color: var(--color-text-secondary);
        line-height: 1.3;
        max-width: 85%;
    }

    .data-grid {
        display: flex;
        flex-direction: column;
    }

    .grid-row {
        display: grid;
        grid-template-columns: 40px 1fr;
        align-items: baseline;
        padding-top: 6px;
    }

    .grid-row:last-child {
        border-bottom: none;
        padding-bottom: 0;
    }

    .grid-label {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: var(--color-primary);
        letter-spacing: 0.05em;
        opacity: 0.9;
        padding-top: 1px;
    }

    .grid-content {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
    }

    .data-entry {
        font-family: var(--font-mono);
        font-size: 0.5rem;
        display: flex;
        align-items: center;
        gap: 2px;
        color: rgba(255, 255, 255, 0.85);
    }

    .filter-hud-static {
        /* Layout: Part of the flow, pushes content down */
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden; /* Important for slide transition */

        /* CRT Scanline Texture */
        background: repeating-linear-gradient(
            0deg,
            transparent,
            transparent 2px,
            rgba(0, 0, 0, 0.5) 3px
        );

        /* Subtle separator */
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .hud-inner {
        padding: 8px 0; /* Vertical padding inside the slide area */
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .hud-icon {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: var(--color-primary);
        background: rgba(250, 204, 21, 0.1);
        border: 1px solid rgba(250, 204, 21, 0.3);
        padding: 2px 6px;
        letter-spacing: 0.05em;
        font-weight: 700;
    }

    .hud-msg {
        font-family: var(--font-mono);
        font-size: 0.4rem;
        color: #888;
        text-transform: uppercase;
    }

    /* The blinking cursor effect */
    .hud-msg::after {
        content: "_";
        animation: blink 1s step-end infinite;
        color: var(--color-primary);
        margin-left: 4px;
    }

    .key {
        color: #fff;
    }

    @keyframes blink {
        0%,
        100% {
            opacity: 1;
        }
        50% {
            opacity: 0;
        }
    }
</style>
