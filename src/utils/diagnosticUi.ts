import type { CompilerDiagnosticSeverity } from './compilerDiagnostics';

export type ProblemsAutoRevealMode = 'never' | 'error' | 'errorOrWarning';

export function shouldRevealProblemsPanel(
    mode: ProblemsAutoRevealMode,
    severity: CompilerDiagnosticSeverity
): boolean {
    if (mode === 'never') {
        return false;
    }
    if (mode === 'errorOrWarning') {
        return true;
    }
    return severity === 'error';
}
