import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

function readSource(relativePath: string): string {
    return fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', relativePath), 'utf8');
}

test('package manifest names remote compile command as remote update', () => {
    const manifest = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8')
    ) as {
        contributes?: {
            commands?: Array<{ command?: string; title?: string }>;
        };
    };
    const command = manifest.contributes?.commands?.find(
        item => item.command === 'game-server-compiler.compileCurrentFile'
    );

    assert.equal(command?.title, '远程Update当前文件');
});

test('button panel source keeps config panel collapsible and labels aligned', () => {
    const source = readSource('buttonProvider.ts');

    assert.match(source, /远程Update当前文件/);
    assert.match(source, /服务端mudlib目录映射路径/);
    assert.match(source, /config-display-toggle/);
    assert.match(source, /保存自动本地编译/);
    assert.match(source, /config-localAutoCompile/);
});

test('button panel source keeps local and remote commands in the requested order', () => {
    const source = readSource('buttonProvider.ts');
    const orderedMarkers = [
        'id="localCompile"',
        'id="configureLocalCompile"',
        'id="generateAutoDeclarations"',
        'id="copyMudPath"',
        'id="favoriteFilesDropdown"',
        '<div class="divider"></div>',
        'id="compile"',
        'id="compileDir"',
        'id="customCommandsDropdown"',
        'id="customEvalsDropdown"',
        'id="restart"',
        'id="connect"'
    ];

    let previousIndex = -1;
    for (const marker of orderedMarkers) {
        const index = source.indexOf(marker);
        assert.notEqual(index, -1, `missing marker: ${marker}`);
        assert.ok(index > previousIndex, `marker out of order: ${marker}`);
        previousIndex = index;
    }
});

test('source keeps a single unified output channel for routine use', () => {
    const extensionSource = readSource('extension.ts');
    const buttonProviderSource = readSource('buttonProvider.ts');
    const errorHandlerSource = readSource('utils/ErrorHandler.ts');

    assert.match(extensionSource, /createOutputChannel\('LPC-MUD工具'\)/);
    assert.doesNotMatch(extensionSource, /createOutputChannel\('LPC服务器'\)/);
    assert.doesNotMatch(extensionSource, /createOutputChannel\('LPC编译'\)/);
    assert.doesNotMatch(buttonProviderSource, /createOutputChannel\('游戏服务器编译器'\)/);
    assert.doesNotMatch(extensionSource, /createOutputChannel\('LPC性能监控报告'\)/);
    assert.doesNotMatch(errorHandlerSource, /createOutputChannel\('LPC服务器错误'\)/);
});

test('source avoids noisy heading logs for copy path and auto declaration commands', () => {
    const extensionSource = readSource('extension.ts');

    assert.doesNotMatch(extensionSource, /==== 复制当前文件相对路径 ====/);
    assert.doesNotMatch(extensionSource, /==== 生成当前文件函数声明 ====/);
    assert.match(extensionSource, /已复制路径:/);
    assert.match(extensionSource, /函数声明已经是最新的/);
});

test('source resolves file-targeted commands through preferred visible editor fallback', () => {
    const extensionSource = readSource('extension.ts');

    assert.match(extensionSource, /function getPreferredFileEditor\(\)/);
    assert.match(extensionSource, /choosePreferredVisibleEditor/);
    assert.match(extensionSource, /rememberFileEditor\(vscode\.window\.activeTextEditor\)/);
    assert.match(extensionSource, /onDidChangeActiveTextEditor\(editor =>/);
});

test('button panel source routes custom data persistence through ConfigManager', () => {
    const source = readSource('buttonProvider.ts');

    assert.match(source, /this\._configManager\.getAuxiliaryData\(\)/);
    assert.match(source, /await this\._configManager\.updateAuxiliaryData\(/);
    assert.doesNotMatch(source, /readFileSync\(configPath/);
    assert.doesNotMatch(source, /writeFileSync\(configPath/);
    assert.doesNotMatch(source, /fs\.watch\(configPath/);
});

test('config manager source serializes saves and awaits vscode config sync writes', () => {
    const source = readSource('config/ConfigManager.ts');

    assert.match(source, /private saveQueue: Promise<void> = Promise\.resolve\(\)/);
    assert.match(source, /const writeTask = this\.saveQueue\.then/);
    assert.match(source, /async updateAuxiliaryData\(newData: ConfigAuxiliaryData\): Promise<void>/);
    assert.match(source, /private async syncVSCodeConfig\(\): Promise<void>/);
    assert.match(source, /await this\.updateConfig\(/);
});

test('config manager source treats structural file config differences as reload changes', () => {
    const source = readSource('config/ConfigManager.ts');

    assert.match(source, /const previousSnapshot = this\.getConfigSnapshot\(\)/);
    assert.match(
        source,
        /const hasStructuralChange =\s*JSON\.stringify\(previousSnapshot\)\s*!==\s*JSON\.stringify\(migratedConfig\)/
    );
    assert.match(source, /if \(hasStructuralChange\)/);
    assert.doesNotMatch(source, /if \(changes\.length > 0\)/);
});

test('config subscriptions are disposable and cleaned up by long-lived services', () => {
    const configManagerSource = readSource('config/ConfigManager.ts');
    const buttonProviderSource = readSource('buttonProvider.ts');
    const tcpClientSource = readSource('tcpClient.ts');

    assert.match(
        configManagerSource,
        /onConfigChanged\(listener: .*?\): vscode\.Disposable/
    );
    assert.match(
        configManagerSource,
        /onProfileChanged\(listener: .*?\): vscode\.Disposable/
    );
    assert.match(
        configManagerSource,
        /return new vscode\.Disposable\(\(\) => \{\s*this\.eventEmitter\.removeListener\('configChanged', listener\);?\s*\}\)/
    );
    assert.match(
        configManagerSource,
        /return new vscode\.Disposable\(\(\) => \{\s*this\.profileEventEmitter\.removeListener\('profileChanged', listener\);?\s*\}\)/
    );
    assert.match(configManagerSource, /this\.eventEmitter\.removeAllListeners\(\)/);
    assert.match(configManagerSource, /this\.profileEventEmitter\.removeAllListeners\(\)/);

    assert.match(
        buttonProviderSource,
        /this\._disposables\.push\(this\._configManager\.onConfigChanged\(\(\) =>/
    );
    assert.match(
        buttonProviderSource,
        /this\._disposables\.push\(this\._configManager\.onProfileChanged\(\(\) =>/
    );

    assert.match(tcpClientSource, /private configDisposables: vscode\.Disposable\[] = \[];/);
    assert.match(tcpClientSource, /this\.configDisposables\.push\(this\.configManager\.onProfileChanged\(/);
    assert.match(tcpClientSource, /this\.configDisposables\.push\(this\.configManager\.onConfigChanged\(/);
    assert.match(tcpClientSource, /this\.configDisposables\.push\(vscode\.workspace\.onDidChangeConfiguration\(/);
    assert.match(tcpClientSource, /this\.configDisposables\.forEach\(d => d\.dispose\(\)\);/);
});
