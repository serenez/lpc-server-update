import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

type PackageManifest = {
    activationEvents?: string[];
    contributes?: {
        configuration?: {
            properties?: Record<string, { default?: unknown }>;
        };
        commands?: Array<{ command?: string }>;
        menus?: {
            'editor/context'?: Array<{ command?: string }>;
        };
    };
};

function loadManifest(): PackageManifest {
    const manifestPath = path.resolve(__dirname, '..', '..', 'package.json');
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackageManifest;
}

test('package manifest keeps auto declare on save disabled by default', () => {
    const manifest = loadManifest();
    const setting = manifest.contributes?.configuration?.properties?.[
        'gameServerCompiler.compile.autoDeclareFunctionsOnSave'
    ];

    assert.equal(setting?.default, false);
});

test('package manifest exposes manual auto declaration command in activation and editor menu', () => {
    const manifest = loadManifest();

    assert.ok(
        manifest.activationEvents?.includes('onCommand:game-server-compiler.generateAutoDeclarations')
    );
    assert.ok(
        manifest.contributes?.commands?.some(
            item => item.command === 'game-server-compiler.generateAutoDeclarations'
        )
    );
    assert.ok(
        manifest.contributes?.menus?.['editor/context']?.some(
            item => item.command === 'game-server-compiler.generateAutoDeclarations'
        )
    );
});

test('package manifest exposes local lpcc command and settings', () => {
    const manifest = loadManifest();
    const properties = manifest.contributes?.configuration?.properties ?? {};

    assert.ok(
        manifest.activationEvents?.includes('onCommand:game-server-compiler.localCompileCurrentFile')
    );
    assert.ok(
        manifest.contributes?.commands?.some(
            item => item.command === 'game-server-compiler.localCompileCurrentFile'
        )
    );
    assert.ok(
        manifest.contributes?.menus?.['editor/context']?.some(
            item => item.command === 'game-server-compiler.localCompileCurrentFile'
        )
    );
    assert.equal(
        properties['gameServerCompiler.localCompile.lpccPath']?.default,
        ''
    );
    assert.equal(
        properties['gameServerCompiler.localCompile.configPath']?.default,
        ''
    );
    assert.equal(
        properties['gameServerCompiler.localCompile.timeout']?.default,
        30000
    );
    assert.equal(
        properties['gameServerCompiler.localCompile.showWarnings']?.default,
        true
    );
    assert.equal(
        properties['gameServerCompiler.localCompile.autoCompileOnSave']?.default,
        false
    );
    assert.equal(
        properties['gameServerCompiler.messages.dedupeWindow']?.default,
        1000
    );
});

test('package manifest exposes local lpcc configure command', () => {
    const manifest = loadManifest();

    assert.ok(
        manifest.activationEvents?.includes('onCommand:game-server-compiler.configureLocalCompile')
    );
    assert.ok(
        manifest.contributes?.commands?.some(
            item => item.command === 'game-server-compiler.configureLocalCompile'
        )
    );
});

test('package manifest keeps compiler diagnostic language in dual mode by default', () => {
    const manifest = loadManifest();
    const setting = manifest.contributes?.configuration?.properties?.[
        'gameServerCompiler.diagnostics.messageLanguage'
    ];

    assert.equal(setting?.default, 'dual');
});
