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
