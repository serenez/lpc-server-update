import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatCompilerDiagnosticSummary } from '../utils/compilerDiagnostics';
import {
    formatCompilerDiagnosticMessage,
    normalizeCompilerDiagnosticMessageLanguage
} from '../utils/compilerDiagnosticLocalization';

test('normalizeCompilerDiagnosticMessageLanguage falls back to dual', () => {
    assert.equal(normalizeCompilerDiagnosticMessageLanguage(undefined), 'dual');
    assert.equal(normalizeCompilerDiagnosticMessageLanguage('invalid'), 'dual');
    assert.equal(normalizeCompilerDiagnosticMessageLanguage('zh'), 'zh');
});

test('formatCompilerDiagnosticMessage keeps raw english in en mode', () => {
    const message = formatCompilerDiagnosticMessage(
        "Unused local variable 'bbb'",
        'warning',
        'en'
    );

    assert.equal(message, "Unused local variable 'bbb'");
});

test('formatCompilerDiagnosticMessage translates warning in dual mode', () => {
    const message = formatCompilerDiagnosticMessage(
        "Unused local variable 'bbb'",
        'warning',
        'dual'
    );

    assert.equal(message, "未使用的局部变量 'bbb'（Unused local variable 'bbb'）");
});

test('formatCompilerDiagnosticMessage translates syntax error in zh mode', () => {
    const message = formatCompilerDiagnosticMessage(
        "syntax error, unexpected L_DEFINED_NAME, expecting L_ASSIGN or ';' or ':'",
        'error',
        'zh'
    );

    assert.equal(
        message,
        "语法错误：遇到意外符号 L_DEFINED_NAME，期望 L_ASSIGN 或 ';' 或 ':'"
    );
});

test('formatCompilerDiagnosticMessage translates argument type errors in zh mode', () => {
    const message = formatCompilerDiagnosticMessage(
        'Bad type for argument 2 of notify_line ( string vs int )',
        'error',
        'zh'
    );

    assert.equal(message, '参数 2 类型错误：notify_line（string vs int）');
});

test('formatCompilerDiagnosticSummary localizes message according to language mode', () => {
    const summary = formatCompilerDiagnosticSummary(
        {
            file: '/file.c',
            line: 584,
            column: 16,
            severity: 'error',
            kind: 'unresolved',
            message: 'Undefined function notify_test'
        },
        { languageMode: 'zh' }
    );

    assert.equal(summary, '❌ /file.c:584:16 未定义函数 notify_test');
});

test('formatCompilerDiagnosticMessage falls back to raw text for unknown messages', () => {
    const message = formatCompilerDiagnosticMessage(
        'Some custom compiler message',
        'error',
        'dual'
    );

    assert.equal(message, 'Some custom compiler message');
});
