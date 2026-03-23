import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
    beginCompilerMessageFilterState,
    consumeCompilerNoiseLine,
    formatCompilerDiagnosticSummary,
    parseCompilerDiagnosticHeader
} from '../utils/compilerDiagnostics';

test('parseCompilerDiagnosticHeader parses error with column', () => {
    const diagnostic = parseCompilerDiagnosticHeader(
        '/cmds/wiz/testcmd.c line 584, column 16: syntax error, unexpected L_DEFINED_NAME, expecting L_ASSIGN or \';\' or \':\''
    );

    assert.deepEqual(diagnostic, {
        file: '/cmds/wiz/testcmd.c',
        line: 584,
        column: 16,
        severity: 'error',
        kind: 'syntax',
        message: 'syntax error, unexpected L_DEFINED_NAME, expecting L_ASSIGN or \';\' or \':\''
    });
});

test('parseCompilerDiagnosticHeader parses warning without column', () => {
    const diagnostic = parseCompilerDiagnosticHeader(
        '/file.c line 583: Warning: Unused local variable \'bbb\''
    );

    assert.deepEqual(diagnostic, {
        file: '/file.c',
        line: 583,
        column: undefined,
        severity: 'warning',
        kind: 'warning',
        message: 'Unused local variable \'bbb\''
    });
});

test('formatCompilerDiagnosticSummary keeps location concise', () => {
    const summary = formatCompilerDiagnosticSummary({
        file: '/file.c',
        line: 584,
        column: 16,
        severity: 'error',
        kind: 'syntax',
        message: 'syntax error, unexpected identifier'
    });

    assert.equal(summary, '❌ /file.c:584:16 syntax error, unexpected identifier');
});

test('consumeCompilerNoiseLine suppresses source and caret lines after diagnostic header', () => {
    let state = beginCompilerMessageFilterState();

    let result = consumeCompilerNoiseLine('mapping bsd', state);
    assert.equal(result.consumed, true);
    state = result.nextState;

    result = consumeCompilerNoiseLine('               ^', state);
    assert.equal(result.consumed, true);
    state = result.nextState;

    result = consumeCompilerNoiseLine('正常服务器消息', state);
    assert.equal(result.consumed, false);
});

test('consumeCompilerNoiseLine does not swallow another compiler header', () => {
    let state = beginCompilerMessageFilterState();

    const result = consumeCompilerNoiseLine(
        '/cmds/other/test.c line 12: syntax error, unexpected identifier',
        state
    );
    assert.equal(result.consumed, false);
});
