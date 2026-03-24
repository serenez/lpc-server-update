import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { shouldAutoDeclareForFile, updateAutoDeclarations } from '../utils/AutoDeclaration';

test('updateAutoDeclarations inserts declaration block after header directives', () => {
    const content = [
        '#include <ansi.h>',
        'inherit F_CLEAN_UP;',
        '',
        'void main() {',
        '    do_something();',
        '}',
        '',
        'protected int do_something() {',
        '    return 1;',
        '}'
    ].join('\n');

    const updated = updateAutoDeclarations(content);

    assert.equal(updated, [
        '#include <ansi.h>',
        'inherit F_CLEAN_UP;',
        '',
        '// --- AUTO DECLARATIONS START ---',
        'void main();',
        'protected int do_something();',
        '// --- AUTO DECLARATIONS END ---',
        '',
        'void main() {',
        '    do_something();',
        '}',
        '',
        'protected int do_something() {',
        '    return 1;',
        '}'
    ].join('\n'));
});

test('updateAutoDeclarations refreshes existing block and supports untyped or multiline signatures', () => {
    const content = [
        '// 文件说明',
        '',
        '// --- AUTO DECLARATIONS START (Buyi)---',
        'int old_decl();',
        '// --- AUTO DECLARATIONS END (Buyi)---',
        '',
        'create()',
        '{',
        '    // fake() { should be ignored',
        '}',
        '',
        'protected int add(',
        '    int left,',
        '    int right',
        ')',
        '{',
        '    return left + right;',
        '}'
    ].join('\n');

    const updated = updateAutoDeclarations(content);

    assert.equal(updated, [
        '// 文件说明',
        '',
        '// --- AUTO DECLARATIONS START ---',
        'create();',
        'protected int add(int left, int right);',
        '// --- AUTO DECLARATIONS END ---',
        '',
        'create()',
        '{',
        '    // fake() { should be ignored',
        '}',
        '',
        'protected int add(',
        '    int left,',
        '    int right',
        ')',
        '{',
        '    return left + right;',
        '}'
    ].join('\n'));
});

test('updateAutoDeclarations removes stale block when file no longer contains functions', () => {
    const content = [
        '#include <ansi.h>',
        '',
        '// --- AUTO DECLARATIONS START (Buyi)---',
        'void main();',
        '// --- AUTO DECLARATIONS END (Buyi)---',
        '',
        'int counter = 1;'
    ].join('\n');

    const updated = updateAutoDeclarations(content);

    assert.equal(updated, [
        '#include <ansi.h>',
        '',
        'int counter = 1;'
    ].join('\n'));
});

test('updateAutoDeclarations collects matching scattered declarations back into auto block', () => {
    const content = [
        '#include <ansi.h>',
        '',
        'void main();',
        'protected int helper(int value);',
        '',
        'void main() {',
        '    helper(1);',
        '}',
        '',
        'protected int helper(',
        '    int value',
        ') {',
        '    return value;',
        '}'
    ].join('\n');

    const updated = updateAutoDeclarations(content);

    assert.equal(updated, [
        '#include <ansi.h>',
        '',
        '// --- AUTO DECLARATIONS START ---',
        'void main();',
        'protected int helper(int value);',
        '// --- AUTO DECLARATIONS END ---',
        '',
        'void main() {',
        '    helper(1);',
        '}',
        '',
        'protected int helper(',
        '    int value',
        ') {',
        '    return value;',
        '}'
    ].join('\n'));
});

test('updateAutoDeclarations does not absorb previous invalid text into the declaration signature', () => {
    const content = [
        'aaaa',
        'void int main() {',
        '    return;',
        '}'
    ].join('\n');

    const updated = updateAutoDeclarations(content);

    assert.equal(updated, [
        '// --- AUTO DECLARATIONS START ---',
        'void int main();',
        '// --- AUTO DECLARATIONS END ---',
        '',
        'aaaa',
        'void int main() {',
        '    return;',
        '}'
    ].join('\n'));
});

test('shouldAutoDeclareForFile only enables .c files under mudlib-like locations', () => {
    assert.equal(shouldAutoDeclareForFile('C:/project/mudlib/cmds/test.c'), true);
    assert.equal(shouldAutoDeclareForFile('C:/project/mudlib/cmds/test.h'), false);
    assert.equal(shouldAutoDeclareForFile('C:/project/src/test.c'), false);
});

test('shouldAutoDeclareForFile accepts detected mud project roots without mudlib directory name', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lpc-auto-declare-'));
    const projectRoot = path.join(base, 'duobao');
    const filePath = path.join(projectRoot, 'adm', 'daemons', 'logind.c');

    fs.mkdirSync(path.join(projectRoot, 'adm'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'cmds'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, 'feature'), { recursive: true });
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '');

    assert.equal(shouldAutoDeclareForFile(filePath), true);

    fs.rmSync(base, { recursive: true, force: true });
});
