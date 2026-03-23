export type CompilerDiagnosticSeverity = 'error' | 'warning';

export type CompilerDiagnosticKind =
    | 'warning'
    | 'syntax'
    | 'unresolved'
    | 'type'
    | 'redeclare'
    | 'illegal'
    | 'generic';

export interface CompilerDiagnostic {
    file: string;
    line: number;
    column?: number;
    severity: CompilerDiagnosticSeverity;
    kind: CompilerDiagnosticKind;
    message: string;
}

export interface CompilerMessageFilterState {
    awaitingSourceLine: boolean;
    awaitingCaretLine: boolean;
}

const COMPILER_HEADER_RE =
    /^\/(?<file>.+?) line (?<line>\d+)(?:, column (?<column>\d+))?: (?:(?<warning>Warning): )?(?<message>.+)$/;

const CARET_LINE_RE = /^\s*\^+\s*$/;

function createIdleFilterState(): CompilerMessageFilterState {
    return {
        awaitingSourceLine: false,
        awaitingCaretLine: false
    };
}

export function beginCompilerMessageFilterState(): CompilerMessageFilterState {
    return {
        awaitingSourceLine: true,
        awaitingCaretLine: true
    };
}

export function classifyCompilerDiagnostic(
    message: string,
    severity: CompilerDiagnosticSeverity
): CompilerDiagnosticKind {
    if (severity === 'warning') {
        return 'warning';
    }
    if (message.startsWith('syntax error')) {
        return 'syntax';
    }
    if (/^Undefined |^Unknown /.test(message)) {
        return 'unresolved';
    }
    if (/Type mismatch|Bad assignment/.test(message)) {
        return 'type';
    }
    if (/Redeclaration|redefine/.test(message)) {
        return 'redeclare';
    }
    if (/^Illegal /.test(message)) {
        return 'illegal';
    }
    return 'generic';
}

export function parseCompilerDiagnosticHeader(line: string): CompilerDiagnostic | null {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(COMPILER_HEADER_RE);
    if (!match?.groups) {
        return null;
    }

    const severity: CompilerDiagnosticSeverity = match.groups.warning ? 'warning' : 'error';
    const message = match.groups.message.trim();

    return {
        file: `/${match.groups.file}`,
        line: Number.parseInt(match.groups.line, 10),
        column: match.groups.column ? Number.parseInt(match.groups.column, 10) : undefined,
        severity,
        kind: classifyCompilerDiagnostic(message, severity),
        message
    };
}

export function formatCompilerDiagnosticSummary(diagnostic: CompilerDiagnostic): string {
    const icon = diagnostic.severity === 'warning' ? '⚠️' : '❌';
    const location = diagnostic.column
        ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
        : `${diagnostic.file}:${diagnostic.line}`;

    return `${icon} ${location} ${diagnostic.message}`;
}

export function consumeCompilerNoiseLine(
    line: string,
    state: CompilerMessageFilterState
): { consumed: boolean; nextState: CompilerMessageFilterState } {
    const trimmedLine = line.trim();

    if (state.awaitingSourceLine) {
        if (!trimmedLine) {
            return { consumed: true, nextState: createIdleFilterState() };
        }
        if (parseCompilerDiagnosticHeader(trimmedLine)) {
            return { consumed: false, nextState: createIdleFilterState() };
        }
        return {
            consumed: true,
            nextState: {
                awaitingSourceLine: false,
                awaitingCaretLine: true
            }
        };
    }

    if (state.awaitingCaretLine) {
        if (CARET_LINE_RE.test(line)) {
            return { consumed: true, nextState: createIdleFilterState() };
        }
        return { consumed: false, nextState: createIdleFilterState() };
    }

    if (CARET_LINE_RE.test(line)) {
        return { consumed: true, nextState: createIdleFilterState() };
    }

    return { consumed: false, nextState: createIdleFilterState() };
}
