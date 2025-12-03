import { Command } from "commander";
import { maxSatisfying } from 'semver';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { readdir } from "fs/promises";
import { select, input } from "@inquirer/prompts";

const execAsync = promisify(exec);

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    gray: '\x1b[90m',
};

const c = {
    info: (text: string) => `${colors.cyan}${text}${colors.reset}`,
    success: (text: string) => `${colors.green}${text}${colors.reset}`,
    error: (text: string) => `${colors.red}${text}${colors.reset}`,
    command: (text: string) => `${colors.blue}${text}${colors.reset}`,
    dim: (text: string) => `${colors.gray}${text}${colors.reset}`,
    bright: (text: string) => `${colors.bright}${text}${colors.reset}`,
    magenta: (text: string) => `${colors.magenta}${text}${colors.reset}`,
};

interface GitHubBranch {
    name: string;
    commit: { sha: string; url: string };
}

interface GitHubRepo {
    default_branch: string;
}

interface ParsedBranch {
    version: string;
    branchName: string;
    fullName: string;
}

interface RcadeGame {
    id: string;
    name: string;
    versions: {
        displayName: string;
        description: string;
    }[];
}

const CLEANUP_MARKER = '__CLEANUP_REMOTE_REFS__';
const GITHUB_API = 'https://api.github.com/repos/rcade-community';
const RCADE_API = "https://rcade.dev/api/v1";

async function fetchRepoInfo(packageName: string): Promise<GitHubRepo> {
    const response = await fetch(`${GITHUB_API}/${packageName}`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch repo info: ${response.status} ${response.statusText}`);
    }

    return response.json() as any;
}

async function fetchBranches(packageName: string): Promise<GitHubBranch[]> {
    const response = await fetch(`${GITHUB_API}/${packageName}/branches`, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch branches: ${response.status} ${response.statusText}`);
    }

    return response.json() as any;
}

async function fetchGames(): Promise<RcadeGame[]> {
    const response = await fetch(`${RCADE_API}/games`);

    if (!response.ok) {
        throw new Error(`Failed to fetch games: ${response.status} ${response.statusText}`);
    }

    return response.json() as any;
}

async function selectGame(): Promise<string> {
    console.log(c.info('\n🎮 Fetching available games...\n'));

    const games = await fetchGames();

    if (games.length === 0) {
        throw new Error('No games available to remix');
    }

    const selectedGame = await select({
        message: 'Select a game to remix:',
        choices: games.map(game => {
            const latestVersion = game.versions[0];
            const displayName = latestVersion?.displayName || game.name;
            const description = latestVersion?.description || '';
            return {
                value: game.name,
                name: displayName,
                description: description ? c.dim(description) : undefined,
            };
        }),
    });

    return selectedGame;
}

async function promptForNewGameId(originalName: string): Promise<string> {
    const gameId = await input({
        message: 'Enter a unique ID for your remixed game:',
        default: `${originalName}-remix`,
        validate: (value) => {
            if (!value.trim()) {
                return 'Game ID is required';
            }
            if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
                return 'Game ID can only contain letters, numbers, underscores, and hyphens';
            }
            return true;
        },
    });
    return gameId;
}

async function promptForNewDisplayName(originalName: string): Promise<string> {
    const displayName = await input({
        message: 'Enter a display name for your remixed game:',
        default: `${originalName} (Remix)`,
        validate: (value) => {
            if (!value.trim()) {
                return 'Display name is required';
            }
            return true;
        },
    });
    return displayName;
}

interface AuthorInfo {
    display_name: string;
    recurse_id?: number;
}

async function promptForAuthor(): Promise<AuthorInfo> {
    const displayName = await input({
        message: 'Enter your name (as the author):',
        validate: (value) => {
            if (!value.trim()) {
                return 'Author name is required';
            }
            return true;
        },
    });

    const recurseIdStr = await input({
        message: 'Enter your Recurse Center ID (optional, press Enter to skip):',
        validate: (value) => {
            if (value.trim() && isNaN(parseInt(value, 10))) {
                return 'Recurse ID must be a number';
            }
            return true;
        },
    });

    const author: AuthorInfo = { display_name: displayName };
    if (recurseIdStr.trim()) {
        author.recurse_id = parseInt(recurseIdStr, 10);
    }

    return author;
}

function parseBranches(branches: GitHubBranch[]): ParsedBranch[] {
    return branches
        .map(branch => {
            const match = branch.name.match(/^([^/]+)\/(.+)$/);
            return match ? {
                version: match[1],
                branchName: match[2],
                fullName: branch.name,
            } : null;
        })
        .filter((b): b is ParsedBranch => b !== null);
}

function findTargetVersion(parsedBranches: ParsedBranch[], requestedVersion?: string): string {
    const versions = [...new Set(parsedBranches.map(b => b.version))];

    if (requestedVersion) {
        if (!versions.includes(requestedVersion)) {
            throw new Error(`Version ${requestedVersion} not found`);
        }
        return requestedVersion;
    }

    const latestVersion = maxSatisfying(versions, '*');
    if (!latestVersion) {
        throw new Error('No valid semver versions found');
    }

    return latestVersion;
}

function stripVersion(branchName: string): string {
    const match = branchName.match(/^[^/]+\/(.+)$/);
    return match ? match[1]! : branchName;
}

function generateCloneCommands(
    packageName: string,
    outputDir: string,
    targetVersion: string,
    parsedBranches: ParsedBranch[],
    defaultBranch: string
): string[] {
    const matchingBranches = parsedBranches.filter(b => b.version === targetVersion);

    if (matchingBranches.length === 0) {
        throw new Error(`No branches found for version ${targetVersion}`);
    }

    const repoUrl = `https://github.com/rcade-community/${packageName}.git`;
    const defaultBranchName = stripVersion(defaultBranch);
    const checkoutBranch = matchingBranches.find(b => b.branchName === defaultBranchName);

    const commands = [
        `git clone --no-checkout ${repoUrl} ${outputDir}`,
        `cd ${outputDir}`,
        ...matchingBranches.map(b => `git fetch origin ${b.fullName}:${b.branchName}`),
        `git remote remove origin`,
        CLEANUP_MARKER,
    ];

    if (checkoutBranch) {
        commands.push(`git checkout ${checkoutBranch.branchName}`);
    }

    return commands;
}

async function getCloneCommand(packageName: string, outputDir: string, version?: string) {
    const [repoInfo, branches] = await Promise.all([
        fetchRepoInfo(packageName),
        fetchBranches(packageName)
    ]);

    const parsedBranches = parseBranches(branches);

    if (parsedBranches.length === 0) {
        throw new Error('No branches with version/branch format found');
    }

    const targetVersion = findTargetVersion(parsedBranches, version);
    const matchingBranches = parsedBranches
        .filter(b => b.version === targetVersion)
        .map(b => b.branchName);

    const commands = generateCloneCommands(packageName, outputDir, targetVersion, parsedBranches, repoInfo.default_branch);

    return { commands, version: targetVersion, branches: matchingBranches };
}

async function executeCommand(command: string, cwd: string): Promise<void> {
    try {
        const { stdout, stderr } = await execAsync(command, { cwd });
        if (stdout) console.log(c.dim(stdout.trim()));
        if (stderr) console.log(c.dim(stderr.trim()));
    } catch (error: any) {
        if (error.stderr) console.log(c.dim(error.stderr.trim()));
        if (error.stdout) console.log(c.dim(error.stdout.trim()));
        if (error.code !== 0 && !error.stderr?.includes('Cloning into')) {
            throw error;
        }
    }
}

async function cleanupRemoteRefs(cwd: string, stepNum: number, totalSteps: number, branchesToKeep: string[]): Promise<void> {
    console.log(`${c.dim(`[${stepNum}/${totalSteps}]`)} 📁 ${c.command('Cleanup extra refs')}`);

    const { stdout } = await execAsync('git for-each-ref --format="%(refname)" refs/heads/', { cwd });
    const refs = stdout
        .trim()
        .split('\n')
        .filter(ref => {
            const branchName = ref.replace('refs/heads/', '');
            return ref.length > 0 && !branchesToKeep.includes(branchName);
        });

    for (const ref of refs) {
        console.log(`    ${c.dim('→')} ${c.command(`git update-ref -d "${ref}"`)}`);
        await execAsync(`git update-ref -d "${ref}"`, { cwd });
    }

    console.log(c.success('  ✓ Complete\n'));
}

interface RemixInfo {
    originalName: string;
    originalVersion: string;
    newGameId: string;
    newDisplayName: string;
    author: AuthorInfo;
}

async function updateManifests(cwd: string, remixInfo: RemixInfo): Promise<void> {
    console.log(c.info('📝 Updating manifests...'));

    try {
        const manifestPaths = await findManifestFiles(cwd);

        if (manifestPaths.length === 0) {
            console.log(c.dim('  No rcade.manifest.json files found\n'));
            return;
        }

        console.log(c.dim(`  Found ${manifestPaths.length} manifest file(s)\n`));

        for (const fullPath of manifestPaths) {
            const relativePath = fullPath.replace(cwd + '/', './');
            console.log(`    ${c.dim('→')} ${c.command(relativePath)}`);

            try {
                const content = await readFile(fullPath, 'utf-8');
                const manifest = JSON.parse(content);

                manifest.name = remixInfo.newGameId;
                manifest.display_name = remixInfo.newDisplayName;
                delete manifest.version;
                manifest.authors = [remixInfo.author];
                manifest.remix_of = { name: remixInfo.originalName, version: remixInfo.originalVersion };

                await writeFile(fullPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
                console.log(c.dim('      ✓ Updated\n'));
            } catch (error) {
                console.log(c.error(`      ✗ Failed: ${error instanceof Error ? error.message : error}\n`));
            }
        }

        console.log(c.success('  ✓ Manifests updated\n'));
    } catch {
        console.log(c.dim('  No rcade.manifest.json files found\n'));
    }
}

async function findManifestFiles(dir: string): Promise<string[]> {
    const manifestFiles: string[] = [];

    async function walk(currentDir: string): Promise<void> {
        const entries = await readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = join(currentDir, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules and hidden directories
                if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
                    continue;
                }
                await walk(fullPath);
            } else if (entry.isFile() && entry.name === 'rcade.manifest.json') {
                manifestFiles.push(fullPath);
            }
        }
    }

    await walk(dir);
    return manifestFiles;
}

async function remix(packageName: string, version?: string) {
    try {
        console.log(`\n${c.bright('🎮 Remixing RCade game:')} ${c.magenta(packageName)}\n`);

        const newGameId = await promptForNewGameId(packageName);
        const newDisplayName = await promptForNewDisplayName(packageName);
        const author = await promptForAuthor();

        console.log('');

        const result = await getCloneCommand(packageName, newGameId, version);

        console.log(`${c.info('📦 Version:')} ${c.bright(result.version)}`);
        console.log(`${c.info('🌿 Branches:')} ${result.branches.map(b => c.bright(b)).join(', ')}\n`);

        let cwd = process.cwd();

        for (let i = 0; i < result.commands.length; i++) {
            const cmd = result.commands[i]!;

            if (cmd === CLEANUP_MARKER) {
                await cleanupRemoteRefs(cwd, i + 1, result.commands.length, result.branches);
                continue;
            }

            console.log(`${c.dim(`[${i + 1}/${result.commands.length}]`)} ${c.command(cmd)}`);

            if (cmd.startsWith('cd ')) {
                cwd = join(cwd, cmd.substring(3));
                console.log(c.success('  ✓ Changed directory\n'));
            } else {
                await executeCommand(cmd, cwd);
                console.log(c.success('  ✓ Complete\n'));
            }
        }

        await updateManifests(cwd, {
            originalName: packageName,
            originalVersion: result.version,
            newGameId,
            newDisplayName,
            author,
        });

        console.log(c.success(`✅ Successfully remixed ${packageName} as ${newGameId}!`));
        console.log(`${c.info('📁 Your game is ready in:')} ${c.bright(`./${newGameId}`)}\n`);
    } catch (error) {
        console.error(`\n${c.error('❌ Error:')} ${error instanceof Error ? error.message : error}`);
        process.exit(1);
    }
}

export const remixCommand = new Command("remix")
    .description("remix an RCade game")
    .argument('[game]', 'name of RCade game to remix (interactive selection if omitted)')
    .option('-v, --src-version <version>', 'specify game version')
    .action(async (packageName, options) => {
        const gameName = packageName || await selectGame();
        remix(gameName, options.srcVersion);
    });