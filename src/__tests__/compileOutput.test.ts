import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    buildCompileOutputFinishLines,
    buildCompileOutputProgressDiagnosticLine,
    buildCompileOutputSessionLines,
    buildCompileOutputStartLines
} from '../utils/compileOutput';

test('buildCompileOutputStartLines creates compact compile header', () => {
    assert.deepEqual(
        buildCompileOutputStartLines('远程编译', '/cmds/wiz/testcmd.c'),
        [
            '',
            '==== 远程编译 ====',
            '目标: /cmds/wiz/testcmd.c',
            '状态: 开始'
        ]
    );
});

test('buildCompileOutputProgressDiagnosticLine marks warning and error severities', () => {
    assert.equal(
        buildCompileOutputProgressDiagnosticLine('warning', '⚠️ /cmds/wiz/testcmd.c:10 Unused local variable'),
        '[警告] ⚠️ /cmds/wiz/testcmd.c:10 Unused local variable'
    );
    assert.equal(
        buildCompileOutputProgressDiagnosticLine('error', '❌ /cmds/wiz/testcmd.c:20 syntax error'),
        '[错误] ❌ /cmds/wiz/testcmd.c:20 syntax error'
    );
});

test('buildCompileOutputFinishLines closes compile section with result summary', () => {
    assert.deepEqual(
        buildCompileOutputFinishLines('成功', '编译成功'),
        [
            '结果: 成功',
            '----------------------------------------'
        ]
    );
});

test('buildCompileOutputSessionLines renders local compile warnings and errors in one block', () => {
    assert.deepEqual(
        buildCompileOutputSessionLines({
            scopeLabel: '本地 LPCC 编译',
            target: '/cmds/wiz/testcmd.c',
            resultLabel: '失败',
            summary: '本地 LPCC 编译失败',
            diagnostics: [
                {
                    severity: 'warning',
                    summary: '⚠️ /cmds/wiz/testcmd.c:579:12 Unused local variable'
                },
                {
                    severity: 'error',
                    summary: '❌ /cmds/wiz/testcmd.c:580:5 syntax error'
                }
            ]
        }),
        [
            '',
            '==== 本地 LPCC 编译 ====',
            '目标: /cmds/wiz/testcmd.c',
            '结果: 失败',
            '诊断:',
            '  - [警告] ⚠️ /cmds/wiz/testcmd.c:579:12 Unused local variable',
            '  - [错误] ❌ /cmds/wiz/testcmd.c:580:5 syntax error',
            '----------------------------------------'
        ]
    );
});

test('buildCompileOutputSessionLines omits diagnostic section for clean success', () => {
    assert.deepEqual(
        buildCompileOutputSessionLines({
            scopeLabel: '本地 LPCC 编译',
            target: '/cmds/wiz/testcmd.c',
            resultLabel: '成功',
            summary: '本地 LPCC 编译完成: /cmds/wiz/testcmd.c'
        }),
        [
            '',
            '==== 本地 LPCC 编译 ====',
            '目标: /cmds/wiz/testcmd.c',
            '结果: 成功',
            '----------------------------------------'
        ]
    );
});
