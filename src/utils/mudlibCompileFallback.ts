import {
    classifyCompilerDiagnostic,
    type CompilerDiagnostic
} from './compilerDiagnostics';

export interface MudlibCompileFallbackState {
    active: boolean;
    file?: string;
    line?: number;
    column?: number;
    awaitingSourceLine: boolean;
    ignoringStackTrace: boolean;
}

const LOCATION_RE =
    /^编译位置[:：]\s*(?<file>\/\S+?)\s+第\s+(?<line>\d+)\s+行(?:[，,]\s*第\s+(?<column>\d+)\s+列)?$/;
const REASON_RE = /^编译原因[:：]\s*(?<message>.+)$/;
const START_RE =
    /^(?:编译\/载入失败(?=$|[:：\s])|重新编译(?=.*发生错误[:：]?))/;
const STACK_ITEM_RE = /^\d+\.\s*/;

export function createMudlibCompileFallbackState(): MudlibCompileFallbackState {
    return {
        active: false,
        awaitingSourceLine: false,
        ignoringStackTrace: false
    };
}

export function consumeMudlibCompileFallbackLine(
    line: string,
    state: MudlibCompileFallbackState
): {
    consumed: boolean;
    nextState: MudlibCompileFallbackState;
    emittedDiagnostic?: CompilerDiagnostic;
} {
    const trimmedLine = line.trim();

    if (!trimmedLine) {
        return {
            consumed: state.active,
            nextState: createMudlibCompileFallbackState()
        };
    }

    if (START_RE.test(trimmedLine)) {
        return {
            consumed: true,
            nextState: {
                active: true,
                awaitingSourceLine: false,
                ignoringStackTrace: false
            }
        };
    }

    const locationMatch = trimmedLine.match(LOCATION_RE);
    if (locationMatch?.groups) {
        return {
            consumed: true,
            nextState: {
                active: true,
                file: locationMatch.groups.file,
                line: Number.parseInt(locationMatch.groups.line, 10),
                column: locationMatch.groups.column
                    ? Number.parseInt(locationMatch.groups.column, 10)
                    : undefined,
                awaitingSourceLine: false,
                ignoringStackTrace: false
            }
        };
    }

    const reasonMatch = trimmedLine.match(REASON_RE);
    if (reasonMatch?.groups && state.file && state.line) {
        const message = reasonMatch.groups.message.trim();
        return {
            consumed: true,
            emittedDiagnostic: {
                file: state.file,
                line: state.line,
                column: state.column,
                severity: 'error',
                kind: classifyCompilerDiagnostic(message, 'error'),
                message
            },
            nextState: {
                ...state,
                active: true
            }
        };
    }

    if (state.awaitingSourceLine) {
        return {
            consumed: true,
            nextState: {
                ...state,
                awaitingSourceLine: false
            }
        };
    }

    if (state.ignoringStackTrace) {
        if (STACK_ITEM_RE.test(trimmedLine) || START_RE.test(trimmedLine)) {
            return {
                consumed: true,
                nextState: {
                    ...state,
                    active: true
                }
            };
        }
        return {
            consumed: false,
            nextState: createMudlibCompileFallbackState()
        };
    }

    if (state.active) {
        if (/^源码片段[:：]/.test(trimmedLine)) {
            return {
                consumed: true,
                nextState: {
                    ...state,
                    awaitingSourceLine: true
                }
            };
        }

        if (/^说明[:：]/.test(trimmedLine)) {
            return {
                consumed: true,
                nextState: {
                    ...state
                }
            };
        }

        if (/^触发链[:：]/.test(trimmedLine)) {
            return {
                consumed: true,
                nextState: {
                    ...state,
                    ignoringStackTrace: true
                }
            };
        }

        if (START_RE.test(trimmedLine)) {
            return {
                consumed: true,
                nextState: createMudlibCompileFallbackState()
            };
        }

        return {
            consumed: false,
            nextState: createMudlibCompileFallbackState()
        };
    }

    return {
        consumed: false,
        nextState: state
    };
}
