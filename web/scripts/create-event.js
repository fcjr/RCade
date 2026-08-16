import { execSync } from 'child_process';
import { randomUUID, randomBytes } from 'crypto';

// Colors and formatting
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
    console.log(`${emoji}  ${color}${message}${colors.reset}`);
}

function logSuccess(message) { log('✓', message, colors.green); }
function logError(message) { log('✗', message, colors.red); }
function logInfo(message) { log('ℹ', message, colors.blue); }
function logWarning(message) { log('⚠', message, colors.yellow); }

async function confirm(message) {
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(`${message} (y/N) `, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase() === 'y');
        });
    });
}

function usage() {
    console.log(`
Usage:
  node scripts/create-event.js create --name "<name>" --starts <ISO date> --ends <ISO date> [--local]
  node scripts/create-event.js list [--local]

Examples:
  node scripts/create-event.js create --name "Spring Game Jam" \\
      --starts "2026-05-01T17:00:00-04:00" --ends "2026-05-01T22:00:00-04:00"
  node scripts/create-event.js list --local
`);
}

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i].startsWith('--')) {
            const key = argv[i].slice(2);
            if (key === 'local') {
                args.local = true;
            } else {
                args[key] = argv[++i];
            }
        } else {
            args._.push(argv[i]);
        }
    }
    return args;
}

function d1Execute(sql, local) {
    const target = local ? '--local' : '--remote';
    const output = execSync(
        `npx wrangler d1 execute rcade ${target} --command "${sql.replace(/"/g, '\\"')}" --json`,
        { encoding: 'utf-8' },
    );
    // wrangler may prepend non-JSON log lines; the payload starts at the first bracket
    const jsonStart = output.indexOf('[');
    return JSON.parse(output.slice(jsonStart));
}

function formatTime(epochSeconds) {
    const date = new Date(epochSeconds * 1000);
    return `${date.toLocaleString()} (${date.toISOString()})`;
}

async function create(args) {
    if (!args.name || !args.starts || !args.ends) {
        logError('create requires --name, --starts, and --ends');
        usage();
        process.exit(1);
    }

    // integer({ mode: 'timestamp' }) columns store epoch SECONDS
    const startsSec = Math.floor(Date.parse(args.starts) / 1000);
    const endsSec = Math.floor(Date.parse(args.ends) / 1000);
    const nowSec = Math.floor(Date.now() / 1000);

    if (Number.isNaN(startsSec) || Number.isNaN(endsSec)) {
        logError('Could not parse --starts/--ends. Use ISO dates, e.g. 2026-05-01T17:00:00-04:00');
        process.exit(1);
    }

    if (endsSec <= startsSec) {
        logError('--ends must be after --starts');
        process.exit(1);
    }

    if (endsSec < nowSec) {
        logWarning('This event is entirely in the past.');
    }
    if (endsSec - startsSec > 14 * 24 * 3600) {
        logWarning('This event spans more than 14 days — the code will be live the whole time.');
    }

    const id = randomUUID();
    const secret = randomBytes(20).toString('hex');
    const name = args.name.replace(/'/g, "''");

    logInfo(`Event:  ${args.name}`);
    logInfo(`Starts: ${formatTime(startsSec)}`);
    logInfo(`Ends:   ${formatTime(endsSec)}`);

    if (!args.local && !(await confirm('Create this event in the PRODUCTION database?'))) {
        logError('Aborted');
        process.exit(1);
    }

    d1Execute(
        `INSERT INTO "events" ("id","name","starts_at","ends_at","totp_secret","created_at") ` +
        `VALUES ('${id}','${name}',${startsSec},${endsSec},'${secret}',${nowSec});`,
        args.local,
    );

    logSuccess(`Created event ${id}`);
    logInfo('The cabinet fetches this event (including the code secret) automatically — nothing to install.');
}

function list(args) {
    const results = d1Execute(
        'SELECT id, name, starts_at, ends_at FROM events ORDER BY starts_at DESC LIMIT 20;',
        args.local,
    );
    const rows = results[0]?.results ?? [];

    if (rows.length === 0) {
        logInfo('No events found.');
        return;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    for (const row of rows) {
        const active = row.starts_at <= nowSec && nowSec <= row.ends_at;
        const marker = active ? `${colors.green}● ACTIVE${colors.reset}` : `${colors.dim}○${colors.reset}`;
        console.log(`${marker} ${colors.bright}${row.name}${colors.reset} ${colors.dim}(${row.id})${colors.reset}`);
        console.log(`   ${formatTime(row.starts_at)} → ${formatTime(row.ends_at)}`);
    }
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

if (command === 'create') {
    await create(args);
} else if (command === 'list') {
    list(args);
} else {
    usage();
    process.exit(command === undefined ? 1 : 0);
}
