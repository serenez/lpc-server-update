import * as nodePath from 'path';

export function normalizeWorkspaceStoredPath(workspaceRoot: string, rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return trimmed;
    }

    if (!nodePath.isAbsolute(trimmed)) {
        return trimmed.replace(/\\/g, '/');
    }

    const relativePath = nodePath.relative(workspaceRoot, trimmed);
    if (!relativePath.startsWith('..') && !nodePath.isAbsolute(relativePath)) {
        return relativePath.replace(/\\/g, '/');
    }

    return trimmed;
}
