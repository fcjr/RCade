import { parseArgs } from 'node:util';
import { CliOptions } from '../shared/types';
import { GameManifest } from '@rcade/api';
import { readFileSync } from 'node:fs';
import { app } from 'electron';

export function parseCliArgs(): CliOptions {
    const args = process.env.RCADE_CABINET_ARGS
        ? process.env.RCADE_CABINET_ARGS.split(' ')
        : app.isPackaged ? process.argv.slice(1) : process.argv.slice(3);

    const { values, positionals } = parseArgs({
        args,
        options: {
            override: {
                type: 'string',
                multiple: true,
                short: 'o'
            },
            'no-exit': {
                type: 'boolean',
                default: false,
                short: 'n'
            }
        },
        allowPositionals: true
    });

    // Parse the first positional as a path
    const path = positionals.length > 0 ? positionals[0] : null;

    // Parse overrides
    const overrides = new Map<string, string>();
    for (const override of values.override || []) {
        const equalIndex = override.indexOf('=');
        if (equalIndex === -1) {
            console.error(`Invalid override format (expected key=value): ${override}`);
            continue;
        }

        const key = override.slice(0, equalIndex);
        const url = override.slice(equalIndex + 1);
        const [packageId, version] = key.split('@');

        if (!packageId || !version) {
            console.error(`Invalid override key format (expected package@version): ${key}`);
            continue;
        }

        overrides.set(`${packageId}@${version}`, url);
    }

    return {
        manifest: path ? GameManifest.parse(JSON.parse(readFileSync(path, "utf-8"))) : null,
        noExit: values['no-exit'] ?? false,
        overrides
    };
}