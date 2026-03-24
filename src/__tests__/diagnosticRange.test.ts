import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { resolveDiagnosticRange } from '../utils/diagnosticRange';

test('resolveDiagnosticRange expands identifier token from explicit column', () => {
    const range = resolveDiagnosticRange({
        lineText: '    notify_test();',
        column: 5,
        message: 'Undefined function notify_test',
        kind: 'unresolved'
    });

    assert.deepEqual(range, { startColumn: 4, endColumn: 15 });
});

test('resolveDiagnosticRange expands named identifier when warning has no column', () => {
    const range = resolveDiagnosticRange({
        lineText: '    string unused_var1;',
        message: 'Unused local variable \'unused_var1\'',
        kind: 'warning'
    });

    assert.deepEqual(range, { startColumn: 11, endColumn: 22 });
});

test('resolveDiagnosticRange keeps single-character fallback for non-identifier token', () => {
    const range = resolveDiagnosticRange({
        lineText: '    notify_line(me, 1);',
        column: 21,
        message: 'Bad type for argument 2 of notify_line ( string vs int )',
        kind: 'type'
    });

    assert.deepEqual(range, { startColumn: 20, endColumn: 21 });
});

test('resolveDiagnosticRange expands unexpected identifier syntax errors conservatively', () => {
    const range = resolveDiagnosticRange({
        lineText: '    test_text',
        column: 5,
        message: 'syntax error, unexpected identifier',
        kind: 'syntax'
    });

    assert.deepEqual(range, { startColumn: 4, endColumn: 13 });
});

test('resolveDiagnosticRange expands unquoted redeclaration names without column', () => {
    const range = resolveDiagnosticRange({
        lineText: '    string value;',
        message: 'Redeclaration of value',
        kind: 'redeclare'
    });

    assert.deepEqual(range, { startColumn: 11, endColumn: 16 });
});

test('resolveDiagnosticRange does not guess when named identifier appears multiple times', () => {
    const range = resolveDiagnosticRange({
        lineText: '    foo = foo + 1;',
        message: 'Unused local variable \'foo\'',
        kind: 'warning'
    });

    assert.deepEqual(range, { startColumn: 0, endColumn: 18 });
});
