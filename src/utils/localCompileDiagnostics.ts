import {
    parseCompilerDiagnosticHeader,
    type CompilerDiagnostic,
} from './compilerDiagnostics';
import {
    consumeMudlibCompileFallbackLine,
    createMudlibCompileFallbackState
} from './mudlibCompileFallback';

function buildDiagnosticKey(diagnostic: CompilerDiagnostic): string {
    return [
        diagnostic.file,
        diagnostic.line,
        diagnostic.severity,
        diagnostic.message
    ].join('|');
}

export function pickPrimaryLocalCompileDiagnostic(
    diagnostics: CompilerDiagnostic[]
): CompilerDiagnostic | undefined {
    return diagnostics.find(diagnostic => diagnostic.severity === 'error') ?? diagnostics[0];
}

export function filterLocalCompileDiagnostics(
    diagnostics: CompilerDiagnostic[],
    showWarnings: boolean
): CompilerDiagnostic[] {
    if (showWarnings) {
        return diagnostics;
    }

    return diagnostics.filter(diagnostic => diagnostic.severity === 'error');
}

export function partitionLocalCompileDiagnostics(diagnostics: CompilerDiagnostic[]): {
    errors: CompilerDiagnostic[];
    warnings: CompilerDiagnostic[];
} {
    const errors: CompilerDiagnostic[] = [];
    const warnings: CompilerDiagnostic[] = [];

    for (const diagnostic of diagnostics) {
        if (diagnostic.severity === 'warning') {
            warnings.push(diagnostic);
            continue;
        }
        errors.push(diagnostic);
    }

    return { errors, warnings };
}

export function orderLocalCompileDiagnosticsForTimeline(
    diagnostics: CompilerDiagnostic[]
): CompilerDiagnostic[] {
    const { errors, warnings } = partitionLocalCompileDiagnostics(diagnostics);
    return [...warnings, ...errors];
}

export function parseLocalCompileDiagnostics(output: string): CompilerDiagnostic[] {
    const diagnostics: CompilerDiagnostic[] = [];
    const seen = new Set<string>();
    let mudlibFallbackState = createMudlibCompileFallbackState();
    const lines = output.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const mudlibFallbackResult = consumeMudlibCompileFallbackLine(line, mudlibFallbackState);
        mudlibFallbackState = mudlibFallbackResult.nextState;

        if (mudlibFallbackResult.emittedDiagnostic) {
            const key = buildDiagnosticKey(mudlibFallbackResult.emittedDiagnostic);
            if (!seen.has(key)) {
                seen.add(key);
                diagnostics.push(mudlibFallbackResult.emittedDiagnostic);
            }
        }

        if (mudlibFallbackResult.consumed) {
            continue;
        }

        const compilerDiagnostic = parseCompilerDiagnosticHeader(line);
        if (!compilerDiagnostic) {
            continue;
        }

        const sourceLine = lines[index + 1];
        if (
            sourceLine &&
            sourceLine.trim() &&
            !parseCompilerDiagnosticHeader(sourceLine)
        ) {
            index += 1;
        }

        const key = buildDiagnosticKey(compilerDiagnostic);
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        diagnostics.push(compilerDiagnostic);
    }

    return diagnostics;
}
