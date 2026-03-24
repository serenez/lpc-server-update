import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { normalizeConfigToV2 } from '../config/configNormalizer';

test('normalizeConfigToV2 keeps v2-like config without version', () => {
    const input = {
        activeProfile: 'default',
        profiles: {
            default: {
                host: '127.0.0.1',
                port: 8888,
                rootPath: 'C:/mud',
                serverKey: 'k1',
                encoding: 'UTF8',
                loginKey: 'k2'
            }
        }
    };

    const result = normalizeConfigToV2(input);
    assert.equal(result.config.version, 2);
    assert.equal(result.config.activeProfile, 'default');
    assert.equal(result.config.profiles.default.host, '127.0.0.1');
});

test('normalizeConfigToV2 unwraps wrongly nested migrated config', () => {
    const input = {
        version: 2,
        activeProfile: 'default',
        profiles: {
            default: {
                version: 2,
                activeProfile: 'prod',
                profiles: {
                    prod: {
                        host: 'localhost',
                        port: 7777,
                        rootPath: 'C:/mud',
                        serverKey: 's1',
                        encoding: 'UTF8',
                        loginKey: 'l1'
                    }
                }
            }
        }
    };

    const result = normalizeConfigToV2(input);
    assert.equal(result.config.activeProfile, 'prod');
    assert.equal(result.config.profiles.prod.host, 'localhost');
});

test('normalizeConfigToV2 preserves top-level custom command data for v2 config', () => {
    const input = {
        version: 2,
        activeProfile: 'default',
        profiles: {
            default: {
                host: '127.0.0.1',
                port: 8888,
                rootPath: 'C:/mud',
                serverKey: 'k1',
                encoding: 'UTF8',
                loginKey: 'k2'
            }
        },
        customCommands: [{ name: 'users', command: 'users' }],
        customEvals: [{ name: 'mem', command: 'memory_info()' }],
        favoriteFiles: [{ name: 'test.c', path: 'cmds/wiz/test.c' }]
    };

    const result = normalizeConfigToV2(input) as typeof normalizeConfigToV2 extends (...args: any[]) => infer R ? R : never;

    assert.deepEqual((result.config as any).customCommands, input.customCommands);
    assert.deepEqual((result.config as any).customEvals, input.customEvals);
    assert.deepEqual((result.config as any).favoriteFiles, input.favoriteFiles);
});

test('normalizeConfigToV2 keeps top-level custom command data out of migrated profile body', () => {
    const input = {
        host: '127.0.0.1',
        port: 8888,
        rootPath: 'C:/mud',
        serverKey: 'k1',
        encoding: 'UTF8',
        loginKey: 'k2',
        customCommands: [{ name: 'users', command: 'users' }],
        customEvals: [{ name: 'mem', command: 'memory_info()' }],
        favoriteFiles: [{ name: 'test.c', path: 'cmds/wiz/test.c' }]
    };

    const result = normalizeConfigToV2(input);

    assert.deepEqual((result.config as any).customCommands, input.customCommands);
    assert.deepEqual((result.config as any).customEvals, input.customEvals);
    assert.deepEqual((result.config as any).favoriteFiles, input.favoriteFiles);
    assert.equal((result.config.profiles.default as any).customCommands, undefined);
    assert.equal((result.config.profiles.default as any).customEvals, undefined);
    assert.equal((result.config.profiles.default as any).favoriteFiles, undefined);
});
