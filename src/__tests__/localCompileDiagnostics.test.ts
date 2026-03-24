import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    filterLocalCompileDiagnostics,
    orderLocalCompileDiagnosticsForTimeline,
    parseLocalCompileDiagnostics,
    partitionLocalCompileDiagnostics,
    pickPrimaryLocalCompileDiagnostic
} from '../utils/localCompileDiagnostics';

test('parseLocalCompileDiagnostics extracts driver style syntax error with caret block', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected L_TYPE_MODIFIER, expecting L_ASSIGN or \';\' or \'(\' or \',\'',
        '  aa',
        '  ^'
    ].join('\n'));

    assert.deepEqual(diagnostics, [
        {
            file: '/cmds/wiz/testcmd.c',
            line: 30,
            column: 3,
            severity: 'error',
            kind: 'syntax',
            message: 'syntax error, unexpected L_TYPE_MODIFIER, expecting L_ASSIGN or \';\' or \'(\' or \',\''
        }
    ]);
});

test('parseLocalCompileDiagnostics parses mudlib fallback block', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '编译/载入失败: /cmds/wiz/testcmd',
        '编译位置: /cmds/wiz/testcmd.c 第 30 行，第 3 列',
        '编译原因: syntax error, unexpected L_TYPE_MODIFIER, expecting L_ASSIGN or \';\' or \'(\' or \',\'',
        '源码片段:',
        '  aa',
        '    ^'
    ].join('\n'));

    assert.deepEqual(diagnostics, [
        {
            file: '/cmds/wiz/testcmd.c',
            line: 30,
            column: 3,
            severity: 'error',
            kind: 'syntax',
            message: 'syntax error, unexpected L_TYPE_MODIFIER, expecting L_ASSIGN or \';\' or \'(\' or \',\''
        }
    ]);
});

test('parseLocalCompileDiagnostics deduplicates repeated compiler headers', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier',
        'bad line',
        '   ^',
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier'
    ].join('\n'));

    assert.equal(diagnostics.length, 1);
});

test('pickPrimaryLocalCompileDiagnostic prefers the first error over earlier warnings', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 10: Warning: Unused local variable \'foo\'',
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier'
    ].join('\n'));

    const primaryDiagnostic = pickPrimaryLocalCompileDiagnostic(diagnostics);

    assert.equal(primaryDiagnostic?.severity, 'error');
    assert.equal(primaryDiagnostic?.line, 30);
});

test('filterLocalCompileDiagnostics hides warnings when configured', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 10: Warning: Unused local variable \'foo\'',
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier'
    ].join('\n'));

    const filteredDiagnostics = filterLocalCompileDiagnostics(diagnostics, false);

    assert.equal(filteredDiagnostics.length, 1);
    assert.equal(filteredDiagnostics[0].severity, 'error');
});

test('partitionLocalCompileDiagnostics keeps errors above warnings for rendering', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 10: Warning: Unused local variable \'foo\'',
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier',
        '/cmds/wiz/testcmd.c line 40: Warning: Unused local variable \'bar\''
    ].join('\n'));

    const partitioned = partitionLocalCompileDiagnostics(diagnostics);

    assert.deepEqual(
        partitioned.errors.map(item => item.line),
        [30]
    );
    assert.deepEqual(
        partitioned.warnings.map(item => item.line),
        [10, 40]
    );
});

test('orderLocalCompileDiagnosticsForTimeline places warnings before errors', () => {
    const diagnostics = parseLocalCompileDiagnostics([
        '/cmds/wiz/testcmd.c line 10: Warning: Unused local variable \'foo\'',
        '/cmds/wiz/testcmd.c line 30, column 3: syntax error, unexpected identifier',
        '/cmds/wiz/testcmd.c line 40: Warning: Unused local variable \'bar\''
    ].join('\n'));

    const ordered = orderLocalCompileDiagnosticsForTimeline(diagnostics);

    assert.deepEqual(
        ordered.map(item => `${item.severity}:${item.line}`),
        ['warning:10', 'warning:40', 'error:30']
    );
});
