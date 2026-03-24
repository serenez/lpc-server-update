import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    discoverMudlibLocalCompileArtifacts,
    discoverMudlibLocalCompileArtifactsCached,
    clearMudlibLocalCompileArtifactsCache,
    resolveMudlibLocalCompilePlan
} from '../utils/localLpcc';

function createMudlibRoot(baseDir: string, rootName: string): string {
    const mudlibRoot = path.join(baseDir, rootName);
    for (const dirName of ['adm', 'cmds', 'feature', 'include', 'std', 'inherit', 'log']) {
        fs.mkdirSync(path.join(mudlibRoot, dirName), { recursive: true });
    }
    return mudlibRoot;
}

test('discoverMudlibLocalCompileArtifacts only scans current mudlib root', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const otherRoot = path.join(workspaceRoot, 'tools');

    fs.mkdirSync(path.join(mudlibRoot, 'bin'), { recursive: true });
    fs.mkdirSync(otherRoot, { recursive: true });

    const mudlibLpcc = path.join(mudlibRoot, 'bin', 'lpcc.exe');
    const mudlibConfig = path.join(mudlibRoot, 'config.ini');
    const outsideLpcc = path.join(otherRoot, 'lpcc.exe');
    const outsideConfig = path.join(otherRoot, 'config.cfg');

    fs.writeFileSync(mudlibLpcc, '');
    fs.writeFileSync(mudlibConfig, '');
    fs.writeFileSync(outsideLpcc, '');
    fs.writeFileSync(outsideConfig, '');

    const artifacts = discoverMudlibLocalCompileArtifacts(mudlibRoot);

    assert.deepEqual(artifacts.lpccPaths, [mudlibLpcc]);
    assert.deepEqual(artifacts.configPaths, [mudlibConfig]);

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolveMudlibLocalCompilePlan auto-detects lpcc and config from current mudlib root', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-plan-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const filePath = path.join(mudlibRoot, 'adm', 'daemons', 'logind.c');
    const lpccPath = path.join(mudlibRoot, 'bin', 'lpcc.exe');
    const configPath = path.join(mudlibRoot, 'config.cfg');

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.mkdirSync(path.dirname(lpccPath), { recursive: true });
    fs.writeFileSync(filePath, 'void main() {}');
    fs.writeFileSync(lpccPath, '');
    fs.writeFileSync(configPath, '');

    const plan = resolveMudlibLocalCompilePlan({
        workspaceRoot,
        filePath
    });

    assert.equal(plan.mudlibRoot, mudlibRoot);
    assert.equal(plan.executablePath, lpccPath);
    assert.equal(plan.configPath, configPath);
    assert.equal(plan.workingDir, mudlibRoot);
    assert.equal(plan.mudPath, '/adm/daemons/logind');

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolveMudlibLocalCompilePlan prefers manual lpcc and config settings', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-settings-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const filePath = path.join(mudlibRoot, 'cmds', 'wiz', 'test.c');
    const autoLpccPath = path.join(mudlibRoot, 'bin', 'lpcc.exe');
    const autoConfigPath = path.join(mudlibRoot, 'config.cfg');
    const manualLpccPath = path.join(mudlibRoot, 'tools', 'lpcc.exe');
    const manualConfigPath = path.join(mudlibRoot, 'etc', 'config.ini');

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.mkdirSync(path.dirname(autoLpccPath), { recursive: true });
    fs.mkdirSync(path.dirname(manualLpccPath), { recursive: true });
    fs.mkdirSync(path.dirname(manualConfigPath), { recursive: true });
    fs.writeFileSync(filePath, 'void main() {}');
    fs.writeFileSync(autoLpccPath, '');
    fs.writeFileSync(autoConfigPath, '');
    fs.writeFileSync(manualLpccPath, '');
    fs.writeFileSync(manualConfigPath, '');

    const plan = resolveMudlibLocalCompilePlan({
        workspaceRoot,
        filePath,
        settings: {
            lpccPath: manualLpccPath,
            configPath: manualConfigPath
        }
    });

    assert.equal(plan.executablePath, manualLpccPath);
    assert.equal(plan.configPath, manualConfigPath);
    assert.equal(plan.workingDir, path.dirname(manualConfigPath));

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolveMudlibLocalCompilePlan throws clear error when lpcc or config is missing', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-missing-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const filePath = path.join(mudlibRoot, 'cmds', 'wiz', 'test.c');

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'void main() {}');

    assert.throws(
        () => resolveMudlibLocalCompilePlan({ workspaceRoot, filePath }),
        /mudlib 目录下未找到 lpcc\.exe/
    );

    fs.mkdirSync(path.join(mudlibRoot, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(mudlibRoot, 'bin', 'lpcc.exe'), '');
    clearMudlibLocalCompileArtifactsCache();

    assert.throws(
        () => resolveMudlibLocalCompilePlan({ workspaceRoot, filePath }),
        /mudlib 目录下未找到 config\.ini 或 config\.cfg/
    );

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolveMudlibLocalCompilePlan rejects manual paths outside current mudlib root', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-outside-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const toolsRoot = path.join(workspaceRoot, 'tools');
    const filePath = path.join(mudlibRoot, 'cmds', 'wiz', 'test.c');
    const outsideLpccPath = path.join(toolsRoot, 'lpcc.exe');
    const outsideConfigPath = path.join(toolsRoot, 'config.ini');

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.mkdirSync(toolsRoot, { recursive: true });
    fs.writeFileSync(filePath, 'void main() {}');
    fs.writeFileSync(outsideLpccPath, '');
    fs.writeFileSync(outsideConfigPath, '');

    assert.throws(
        () => resolveMudlibLocalCompilePlan({
            workspaceRoot,
            filePath,
            settings: {
                lpccPath: outsideLpccPath,
                configPath: outsideConfigPath
            }
        }),
        /手动配置的 lpcc\.exe 必须位于当前 mudlib 目录内/
    );

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('discoverMudlibLocalCompileArtifactsCached reuses recent result for the same mudlib root', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-cache-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const lpccPath = path.join(mudlibRoot, 'bin', 'lpcc.exe');

    fs.mkdirSync(path.dirname(lpccPath), { recursive: true });
    fs.writeFileSync(lpccPath, '');

    clearMudlibLocalCompileArtifactsCache();
    const first = discoverMudlibLocalCompileArtifactsCached(mudlibRoot, 10_000);

    fs.unlinkSync(lpccPath);
    const second = discoverMudlibLocalCompileArtifactsCached(mudlibRoot, 10_000);

    assert.deepEqual(first, second);

    clearMudlibLocalCompileArtifactsCache();
    const third = discoverMudlibLocalCompileArtifactsCached(mudlibRoot, 10_000);
    assert.deepEqual(third.lpccPaths, []);

    fs.rmSync(baseDir, { recursive: true, force: true });
});

test('resolveMudlibLocalCompilePlan reuses cached mudlib discovery during repeated resolution', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-local-lpcc-plan-cache-'));
    const workspaceRoot = path.join(baseDir, 'workspace');
    const mudlibRoot = createMudlibRoot(workspaceRoot, 'duobao');
    const filePath = path.join(mudlibRoot, 'cmds', 'wiz', 'test.c');
    const lpccPath = path.join(mudlibRoot, 'bin', 'lpcc.exe');
    const configPath = path.join(mudlibRoot, 'config.ini');

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.mkdirSync(path.dirname(lpccPath), { recursive: true });
    fs.writeFileSync(filePath, 'void main() {}');
    fs.writeFileSync(lpccPath, '');
    fs.writeFileSync(configPath, '');

    clearMudlibLocalCompileArtifactsCache();
    const first = resolveMudlibLocalCompilePlan({ workspaceRoot, filePath });

    fs.unlinkSync(lpccPath);
    const second = resolveMudlibLocalCompilePlan({ workspaceRoot, filePath });

    assert.equal(first.executablePath, second.executablePath);
    assert.equal(first.configPath, second.configPath);

    clearMudlibLocalCompileArtifactsCache();
    assert.throws(
        () => resolveMudlibLocalCompilePlan({ workspaceRoot, filePath }),
        /mudlib 目录下未找到 lpcc\.exe/
    );

    fs.rmSync(baseDir, { recursive: true, force: true });
});
