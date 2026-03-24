import type { CompilerDiagnosticSeverity } from './compilerDiagnostics';

export interface CompileOutputDiagnosticSummary {
    severity: CompilerDiagnosticSeverity;
    summary: string;
}

export interface CompileOutputSessionOptions {
    scopeLabel: string;
    target: string;
    resultLabel: string;
    summary: string;
    diagnostics?: CompileOutputDiagnosticSummary[];
}

export function buildCompileOutputStartLines(scopeLabel: string, target: string): string[] {
    return [
        '',
        `==== ${scopeLabel} ====`,
        `目标: ${target}`,
        '状态: 开始'
    ];
}

export function buildCompileOutputProgressDiagnosticLine(
    severity: CompilerDiagnosticSeverity,
    summary: string
): string {
    return `${severity === 'warning' ? '[警告]' : '[错误]'} ${summary}`;
}

export function buildCompileOutputFinishLines(resultLabel: string, summary: string): string[] {
    void summary;
    return [
        `结果: ${resultLabel}`,
        '----------------------------------------'
    ];
}

export function buildCompileOutputSessionLines(options: CompileOutputSessionOptions): string[] {
    const lines = [
        '',
        `==== ${options.scopeLabel} ====`,
        `目标: ${options.target}`,
        `结果: ${options.resultLabel}`
    ];

    if (options.diagnostics && options.diagnostics.length > 0) {
        lines.push('诊断:');
        for (const diagnostic of options.diagnostics) {
            lines.push(`  - ${buildCompileOutputProgressDiagnosticLine(diagnostic.severity, diagnostic.summary)}`);
        }
    }

    void options.summary;
    lines.push('----------------------------------------');
    return lines;
}
