import * as path from 'path';
import { PathConverter } from './PathConverter';

const AUTO_DECLARATION_START = '// --- AUTO DECLARATIONS START ---';
const AUTO_DECLARATION_END = '// --- AUTO DECLARATIONS END ---';
const LEGACY_AUTO_DECLARATION_START = '// --- AUTO DECLARATIONS START (Buyi)---';
const LEGACY_AUTO_DECLARATION_END = '// --- AUTO DECLARATIONS END (Buyi)---';

const CONTROL_FLOW_NAMES = new Set(['if', 'for', 'while', 'switch', 'catch', 'foreach']);
const FUNCTION_DEFINITION_REGEX =
    /^(?!\s*#)\s*(?:(?<signature>[A-Za-z_][A-Za-z0-9_\s*]*?)\s+)?(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*\((?<args>[^;{}]*)\)\s*(?:\r?\n\s*)?\{/gm;
const INHERIT_DIRECTIVE_REGEX = /^(?:[A-Za-z_][A-Za-z0-9_]*\s+)*inherit\s+[^;]+;$/;

export function shouldAutoDeclareForFile(filePath: string): boolean {
    if (path.extname(filePath).toLowerCase() !== '.c') {
        return false;
    }

    const segments = path.resolve(filePath).split(path.sep).map(segment => segment.toLowerCase());
    if (segments.includes('mudlib')) {
        return true;
    }

    return PathConverter.findMudProjectRootFromFile(filePath) !== null;
}

export function updateAutoDeclarations(content: string): string {
    const eol = detectEol(content);
    const { contentWithoutBlock, hadBlock } = removeAutoDeclarationBlock(content);
    const declarations = collectFunctionDeclarations(contentWithoutBlock);

    if (declarations.length === 0) {
        return hadBlock ? contentWithoutBlock : content;
    }

    const declarationBlock = [
        AUTO_DECLARATION_START,
        ...declarations,
        AUTO_DECLARATION_END
    ].join(eol);

    const insertPos = findInsertPosition(contentWithoutBlock, eol);
    const prefix = contentWithoutBlock
        .slice(0, insertPos)
        .replace(/(?:\r?\n[ \t]*)+$/, '')
        .replace(/[ \t]+$/, '');
    const suffix = contentWithoutBlock
        .slice(insertPos)
        .replace(/^(?:[ \t]*\r?\n)+/, '');

    return [prefix, declarationBlock, suffix].filter(Boolean).join(`${eol}${eol}`);
}

function detectEol(content: string): string {
    return content.includes('\r\n') ? '\r\n' : '\n';
}

function removeAutoDeclarationBlock(content: string): { contentWithoutBlock: string; hadBlock: boolean } {
    const startMarkers = [
        escapeRegExp(AUTO_DECLARATION_START),
        escapeRegExp(LEGACY_AUTO_DECLARATION_START)
    ].join('|');
    const endMarkers = [
        escapeRegExp(AUTO_DECLARATION_END),
        escapeRegExp(LEGACY_AUTO_DECLARATION_END)
    ].join('|');
    const blockPattern = new RegExp(
        `(?:\\r?\\n)?(?:${startMarkers})\\r?\\n[\\s\\S]*?(?:${endMarkers})(?:\\r?\\n)?`,
        'm'
    );
    const hadBlock = blockPattern.test(content);

    return {
        contentWithoutBlock: hadBlock ? content.replace(blockPattern, '') : content,
        hadBlock
    };
}

function collectFunctionDeclarations(content: string): string[] {
    const declarations = new Set<string>();
    const scanContent = stripCommentsPreserveLayout(content);

    for (const match of scanContent.matchAll(FUNCTION_DEFINITION_REGEX)) {
        const name = match.groups?.name?.trim() ?? '';
        if (!name || CONTROL_FLOW_NAMES.has(name)) {
            continue;
        }

        const signature = normalizeSignaturePart(match.groups?.signature ?? '');
        const args = normalizeSignaturePart(match.groups?.args ?? '');
        const declaration = signature
            ? `${signature} ${name}(${args});`
            : `${name}(${args});`;

        declarations.add(declaration);
    }

    return [...declarations];
}

function normalizeSignaturePart(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function findInsertPosition(content: string, eol: string): number {
    const lines = content.split(/\r?\n/);
    let offset = 0;
    let insertPos = 0;
    let inBlockComment = false;

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const trimmed = line.trim();
        const lineEnd = offset + line.length + (index < lines.length - 1 ? eol.length : 0);

        if (inBlockComment) {
            insertPos = lineEnd;
            offset = lineEnd;
            if (trimmed.includes('*/')) {
                inBlockComment = false;
            }
            continue;
        }

        if (trimmed === '') {
            insertPos = lineEnd;
            offset = lineEnd;
            continue;
        }

        if (trimmed.startsWith('//')) {
            insertPos = lineEnd;
            offset = lineEnd;
            continue;
        }

        if (trimmed.startsWith('/*')) {
            insertPos = lineEnd;
            offset = lineEnd;
            if (!trimmed.includes('*/')) {
                inBlockComment = true;
            }
            continue;
        }

        if (trimmed.startsWith('#') || INHERIT_DIRECTIVE_REGEX.test(trimmed)) {
            insertPos = lineEnd;
            offset = lineEnd;
            continue;
        }

        break;
    }

    return insertPos;
}

function stripCommentsPreserveLayout(content: string): string {
    let result = '';
    let index = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let stringQuote: '"' | '\'' | null = null;

    while (index < content.length) {
        const current = content[index];
        const next = index + 1 < content.length ? content[index + 1] : '';

        if (inLineComment) {
            if (current === '\n') {
                inLineComment = false;
                result += current;
            } else if (current === '\r') {
                result += current;
            } else {
                result += ' ';
            }
            index += 1;
            continue;
        }

        if (inBlockComment) {
            if (current === '*' && next === '/') {
                result += '  ';
                inBlockComment = false;
                index += 2;
                continue;
            }

            if (current === '\n' || current === '\r') {
                result += current;
            } else {
                result += ' ';
            }
            index += 1;
            continue;
        }

        if (stringQuote) {
            result += current;
            if (current === '\\' && next) {
                result += next;
                index += 2;
                continue;
            }
            if (current === stringQuote) {
                stringQuote = null;
            }
            index += 1;
            continue;
        }

        if (current === '/' && next === '/') {
            result += '  ';
            inLineComment = true;
            index += 2;
            continue;
        }

        if (current === '/' && next === '*') {
            result += '  ';
            inBlockComment = true;
            index += 2;
            continue;
        }

        if (current === '"' || current === '\'') {
            stringQuote = current;
        }

        result += current;
        index += 1;
    }

    return result;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
