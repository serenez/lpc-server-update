import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PathConverter } from '../utils/PathConverter';

test('toMudPath converts path under root', () => {
    const mudPath = PathConverter.toMudPath('C:/mudlib/cmds/test.c', 'C:/mudlib');
    assert.equal(mudPath, '/cmds/test');
});

test('toMudPath rejects path outside root', () => {
    assert.throws(
        () => PathConverter.toMudPath('D:/other/outside/test.c', 'C:/mudlib'),
        /非法的路径/
    );
});

test('toMudPathWithFallbackRoot uses workspace root when configured root mismatches', () => {
    const mudPath = PathConverter.toMudPathWithFallbackRoot(
        'c:/Users/vrustx/Desktop/mud_nextB/duobao/cmds/arch/ban.c',
        'c:/Users/vrustx/Desktop/mud_old/duobao',
        'c:/Users/vrustx/Desktop/mud_nextB/duobao'
    );
    assert.equal(mudPath, '/cmds/arch/ban');
});

test('resolveMudPathWithRoot returns used root path when fallback is used', () => {
    const result = PathConverter.resolveMudPathWithRoot(
        'c:/Users/vrustx/Desktop/mud_nextB/duobao/cmds/arch/ban.c',
        'c:/Users/vrustx/Desktop/mud_old/duobao',
        'c:/Users/vrustx/Desktop/mud_nextB/duobao'
    );
    assert.equal(result.usedRootPath, 'c:/Users/vrustx/Desktop/mud_nextB/duobao');
    assert.equal(result.mudPath, '/cmds/arch/ban');
});

test('findMudProjectRootFromFile detects root when at least 3 required dirs exist', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-root-test-'));
    const projectRoot = path.join(base, 'duobao');
    const filePath = path.join(projectRoot, 'adm', 'daemons', 'logind.c');

    fs.mkdirSync(path.join(projectRoot, 'adm'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'cmds'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'feature'), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    const detected = PathConverter.findMudProjectRootFromFile(filePath);
    assert.equal(path.normalize(detected || ''), path.normalize(projectRoot));

    fs.rmSync(base, { recursive: true, force: true });
});

test('findMudProjectRootFromFile returns null when fewer than 3 marker dirs exist', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-root-miss-test-'));
    const projectRoot = path.join(base, 'duobao');
    const filePath = path.join(projectRoot, 'adm', 'daemons', 'logind.c');

    fs.mkdirSync(path.join(projectRoot, 'adm'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'cmds'), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    const detected = PathConverter.findMudProjectRootFromFile(filePath);
    assert.equal(detected, null);

    fs.rmSync(base, { recursive: true, force: true });
});

test('resolveMudPathAutoRoot uses detected mud project root', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-auto-root-test-'));
    const parent = path.join(base, 'workspace-parent');
    const projectRoot = path.join(parent, 'duobao');
    const filePath = path.join(projectRoot, 'adm', 'daemons', 'logind.c');

    fs.mkdirSync(path.join(projectRoot, 'adm'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'cmds'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'feature'), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    const resolved = PathConverter.resolveMudPathAutoRoot(
        filePath,
        parent,
        path.join(parent, 'some-other-root')
    );

    assert.equal(resolved.mudPath, '/adm/daemons/logind');
    assert.equal(path.normalize(resolved.usedRootPath), path.normalize(projectRoot));

    fs.rmSync(base, { recursive: true, force: true });
});
