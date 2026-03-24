import * as fs from 'fs';
import type { CompilerDiagnosticKind } from './compilerDiagnostics';

export interface DiagnosticRangeInput {
    lineText?: string;
    column?: number;
    message: string;
    kind?: CompilerDiagnosticKind;
}

export interface DiagnosticRange {
    startColumn: number;
    endColumn: number;
}

const IDENTIFIER_CHAR_RE = /[A-Za-z0-9_]/;

export function createFileLineTextResolver(): (filePath: string, line: number) => string | undefined {
    const cache = new Map<string, string[]>();

    return (filePath: string, line: number): string | undefined => {
        if (line <= 0 || !filePath) {
            return undefined;
        }

        if (!cache.has(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                cache.set(filePath, content.split(/\r?\n/));
            } catch {
                cache.set(filePath, []);
            }
        }

        return cache.get(filePath)?.[line - 1];
    };
}

export function resolveDiagnosticRange(input: DiagnosticRangeInput): DiagnosticRange {
    const fallbackStart = input.column ? Math.max(input.column - 1, 0) : 0;
    const fallbackEnd = input.column
        ? fallbackStart + 1
        : input.lineText
            ? input.lineText.length
            : Number.MAX_SAFE_INTEGER;

    if (!input.lineText) {
        return { startColumn: fallbackStart, endColumn: fallbackEnd };
    }

    if (input.column) {
        const expanded = expandIdentifierAtColumn(input.lineText, fallbackStart);
        if (expanded) {
            return expanded;
        }
    }

    const namedIdentifier = extractNamedIdentifier(input.message, input.kind);
    if (namedIdentifier) {
        const located = findUniqueIdentifierOccurrence(input.lineText, namedIdentifier);
        if (located) {
            return located;
        }
    }

    return { startColumn: fallbackStart, endColumn: fallbackEnd };
}

function expandIdentifierAtColumn(lineText: string, column: number): DiagnosticRange | undefined {
    if (column < 0 || column >= lineText.length || !IDENTIFIER_CHAR_RE.test(lineText[column])) {
        return undefined;
    }

    let start = column;
    let end = column + 1;

    while (start > 0 && IDENTIFIER_CHAR_RE.test(lineText[start - 1])) {
        start -= 1;
    }

    while (end < lineText.length && IDENTIFIER_CHAR_RE.test(lineText[end])) {
        end += 1;
    }

    return { startColumn: start, endColumn: end };
}

function extractNamedIdentifier(message: string, kind?: CompilerDiagnosticKind): string | undefined {
    const quoted = message.match(/'(?<name>[A-Za-z_][A-Za-z0-9_]*)'/)?.groups?.name;
    if (quoted) {
        return quoted;
    }

    const allowUnquotedName =
        kind === 'unresolved' ||
        kind === 'redeclare' ||
        kind === 'warning' ||
        kind === 'generic';
    if (!allowUnquotedName) {
        return undefined;
    }

    const patterns = [
        /^Undefined function (?<name>[A-Za-z_][A-Za-z0-9_]*)/,
        /^Undefined variable (?<name>[A-Za-z_][A-Za-z0-9_]*)/,
        /^Unknown (?:identifier|function|variable) (?<name>[A-Za-z_][A-Za-z0-9_]*)/,
        /^Redeclaration of (?<name>[A-Za-z_][A-Za-z0-9_]*)/
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match?.groups?.name) {
            return match.groups.name;
        }
    }

    return undefined;
}

function findUniqueIdentifierOccurrence(lineText: string, identifier: string): DiagnosticRange | undefined {
    const matches: DiagnosticRange[] = [];
    let searchFrom = 0;

    while (searchFrom < lineText.length) {
        const foundAt = lineText.indexOf(identifier, searchFrom);
        if (foundAt < 0) {
            break;
        }

        const before = foundAt === 0 ? '' : lineText[foundAt - 1];
        const afterIndex = foundAt + identifier.length;
        const after = afterIndex >= lineText.length ? '' : lineText[afterIndex];
        const validBefore = !before || !IDENTIFIER_CHAR_RE.test(before);
        const validAfter = !after || !IDENTIFIER_CHAR_RE.test(after);

        if (validBefore && validAfter) {
            matches.push({
                startColumn: foundAt,
                endColumn: foundAt + identifier.length
            });
        }

        searchFrom = foundAt + identifier.length;
    }

    if (matches.length !== 1) {
        return undefined;
    }

    return matches[0];
}
