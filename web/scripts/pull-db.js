import { drizzle } from 'drizzle-orm/d1';
import { rm } from 'fs/promises';
import { execSync } from 'child_process';
import * as schema from '../src/lib/db/schema';
import { sql } from 'drizzle-orm';

// Colors and formatting
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
};

function log(emoji, message, color = colors.reset) {
    console.log(`${emoji}  ${color}${message}${colors.reset}`);
}

function logSuccess(message) {
    log('✓', message, colors.green);
}

function logError(message) {
    log('✗', message, colors.red);
}

function logInfo(message) {
    log('ℹ', message, colors.blue);
}

function logWarning(message) {
    log('⚠', message, colors.yellow);
}

function logStep(message) {
    console.log(`\n${colors.bright}${colors.cyan}${message}${colors.reset}`);
}

function formatReadCost(rows) {
    const reads = rows;
    const freeLimit = 25_000_000;
    const costPerMillion = 0.001;

    if (reads < freeLimit) {
        const percentUsed = ((reads / freeLimit) * 100).toFixed(3);
        return `~${reads.toLocaleString()} reads (~${percentUsed}% of daily free tier)`;
    }

    const cost = ((reads - freeLimit) / 1_000_000) * costPerMillion;
    return `~${reads.toLocaleString()} reads (${cost.toFixed(4)})`;
}

async function confirm(message) {
    const readline = await import('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question(message, (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

async function pullDatabase() {
    // Show cost warning
    console.log(`
${colors.yellow}${colors.bright}⚠️  Cost Warning${colors.reset}

This command will:
  • Read all data from your remote D1 database
  • Replace your local database completely
        `);

    const shouldContinue = await confirm(`${colors.bright}Continue with sync?${colors.reset} (y/n): `);

    if (!shouldContinue) {
        logWarning('Sync cancelled by user');
        process.exit(0);
    }

    const startTime = Date.now();
    let totalRows = 0;
    let successfulTables = 0;
    let failedTables = 0;
    const backupPath = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject.backup';
    let hasBackup = false;

    try {
        logStep('🗄️  Database Sync Starting...');

        // Step 1: Backup existing database
        logInfo('Backing up existing local database...');
        try {
            const { access, rename } = await import('fs/promises');
            const dbPath = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

            try {
                await access(dbPath);
                await rename(dbPath, backupPath);
                hasBackup = true;
                logSuccess('Existing database backed up');
            } catch {
                logWarning('No existing database to backup');
            }
        } catch (err) {
            logWarning('Could not create backup, continuing anyway...');
        }

        // Step 2: Run migrations
        logStep('📦 Running Migrations');
        try {
            execSync('wrangler d1 migrations apply rcade --local', {
                stdio: ['pipe', 'pipe', 'pipe'],
                input: 'y\n'
            });
            logSuccess('Migrations applied successfully');
        } catch (err) {
            throw new Error('Failed to apply migrations');
        }

        // Step 3: Connect to database
        logStep('🔌 Connecting to Databases');
        const { getPlatformProxy } = await import('wrangler');
        const { env } = await getPlatformProxy({
            persist: { path: '.wrangler/state/v3' }
        });
        const localDb = drizzle(env.DB);
        logSuccess('Connected to local database');

        // Step 4: Analyze dependencies
        logStep('🔍 Analyzing Schema');
        const tablesResult = await localDb.all(sql`
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            AND name NOT LIKE 'sqlite_%' 
            AND name NOT LIKE '_cf_%'
            AND name != 'd1_migrations'
        `);

        const allTables = tablesResult.map(t => t.name);
        logInfo(`Found ${allTables.length} tables to sync`);

        // Get foreign key relationships
        const dependencies = new Map();
        for (const table of allTables) {
            const fkResult = await localDb.all(sql.raw(`PRAGMA foreign_key_list("${table}")`));
            const deps = fkResult.map(fk => fk.table).filter(Boolean);
            dependencies.set(table, deps);
        }

        // Topological sort
        const sorted = [];
        const visited = new Set();
        const visiting = new Set();

        function visit(table) {
            if (visited.has(table)) return;
            if (visiting.has(table)) return;

            visiting.add(table);
            const deps = dependencies.get(table) || [];
            for (const dep of deps) {
                if (allTables.includes(dep)) {
                    visit(dep);
                }
            }
            visiting.delete(table);
            visited.add(table);
            sorted.push(table);
        }

        for (const table of allTables) {
            visit(table);
        }

        logSuccess(`Determined insert order (${sorted.length} tables)`);
        console.log(`${colors.dim}   ${sorted.join(' → ')}${colors.reset}`);

        // Step 5: Sync data
        logStep('📥 Syncing Data from Remote');

        for (let i = 0; i < sorted.length; i++) {
            const tableName = sorted[i];
            const tableNum = `${i + 1}/${sorted.length}`;

            try {
                process.stdout.write(`${colors.dim}[${tableNum}]${colors.reset} ${tableName}...`);

                const output = execSync(
                    `wrangler d1 execute rcade --remote --command "SELECT * FROM \\"${tableName}\\"" --json`,
                    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
                );

                const result = JSON.parse(output);
                const data = result[0]?.results || [];

                if (data.length === 0) {
                    console.log(` ${colors.dim}(empty)${colors.reset}`);
                    successfulTables++;
                    continue;
                }

                // Batch insert
                const statements = data.map(row => {
                    const columns = Object.keys(row);
                    const placeholders = columns.map(() => '?').join(',');
                    const values = columns.map(col => row[col]);
                    const query = `INSERT INTO "${tableName}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${placeholders})`;
                    return env.DB.prepare(query).bind(...values);
                });

                await env.DB.batch(statements);

                console.log(` ${colors.green}✓ ${data.length} rows${colors.reset}`);
                totalRows += data.length;
                successfulTables++;

            } catch (err) {
                console.log(` ${colors.red}✗ ${err.message.split(':')[0]}${colors.reset}`);
                failedTables++;
            }
        }

        // Summary
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        logStep('📊 Sync Complete');

        console.log(`
${colors.bright}Summary:${colors.reset}
  ${colors.green}✓ ${successfulTables} tables synced${colors.reset}
  ${failedTables > 0 ? `${colors.red}✗ ${failedTables} tables failed${colors.reset}` : ''}
  ${colors.cyan}📦 ${totalRows.toLocaleString()} total rows${colors.reset}
  ${colors.dim}⏱  ${duration}s${colors.reset}
        `);

        if (failedTables > 0) {
            logWarning('Some tables failed to sync. Check logs above for details.');
            process.exit(1);
        }

        logSuccess('Database sync completed successfully! 🎉');

        // Clean up backup on success
        if (hasBackup) {
            try {
                await rm(backupPath, { recursive: true, force: true });
                logInfo('Backup cleaned up');
            } catch (err) {
                logWarning('Could not remove backup (this is fine)');
            }
        }

        process.exit(0);

    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        logStep('💥 Sync Failed');
        console.log(`
${colors.red}${colors.bright}Error:${colors.reset} ${error.message}

${colors.dim}Duration: ${duration}s${colors.reset}
        `);

        if (error.stack) {
            console.log(`${colors.dim}Stack trace:${colors.reset}`);
            console.log(colors.dim + error.stack + colors.reset);
        }

        // Restore backup on failure
        if (hasBackup) {
            logStep('🔄 Restoring Backup');
            try {
                const { rename } = await import('fs/promises');
                const dbPath = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';

                // Remove failed database if it exists
                await rm(dbPath, { recursive: true, force: true });

                // Restore backup
                await rename(backupPath, dbPath);
                logSuccess('Previous database restored successfully');
            } catch (restoreErr) {
                logError('Failed to restore backup!');
                console.log(`${colors.red}Backup location: ${backupPath}${colors.reset}`);
                console.log(`${colors.yellow}You may need to manually restore your database${colors.reset}`);
            }
        }

        logInfo('Try running the sync again, or check your database configuration.');
        process.exit(1);
    }
}

pullDatabase();