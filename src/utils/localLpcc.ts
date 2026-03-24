import * as fs from 'fs';
import * as path from 'path';
import { PathConverter } from './PathConverter';

const CONFIG_FILE_PRIORITY = new Map<string, number>([
    ['config.ini', 0],
    ['config.cfg', 1]
]);

export interface LocalLpccSettings {
    lpccPath?: string;
    configPath?: string;
}

export interface MudlibLocalCompileArtifacts {
    lpccPaths: string[];
    configPaths: string[];
}

export interface MudlibLocalCompilePlan {
    mudlibRoot: string;
    executablePath: string;
    configPath: string;
    workingDir: string;
    mudPath: string;
}

export interface ResolveMudlibLocalCompilePlanOptions {
    workspaceRoot: string;
    filePath: string;
    settings?: LocalLpccSettings;
}

export function discoverMudlibLocalCompileArtifacts(mudlibRoot: string): MudlibLocalCompileArtifacts {
    const normalizedRoot = path.resolve(mudlibRoot);

    return {
        lpccPaths: findFiles(normalizedRoot, (entryPath, entryName) => {
            if (entryName.toLowerCase() !== 'lpcc.exe') {
                return false;
            }
            return isInsideRoot(normalizedRoot, entryPath);
        }),
        configPaths: findFiles(normalizedRoot, (entryPath, entryName) => {
            const lowerName = entryName.toLowerCase();
            if (lowerName !== 'config.ini' && lowerName !== 'config.cfg') {
                return false;
            }
            return isInsideRoot(normalizedRoot, entryPath);
        }).sort((left, right) => compareConfigPathPriority(normalizedRoot, left, right))
    };
}

export function resolveMudlibLocalCompilePlan(
    options: ResolveMudlibLocalCompilePlanOptions
): MudlibLocalCompilePlan {
    const mudlibRoot = PathConverter.findMudProjectRootFromFile(options.filePath);
    if (!mudlibRoot) {
        throw new Error('无法识别当前文件所属的 mudlib 根目录');
    }

    const normalizedMudlibRoot = path.resolve(mudlibRoot);
    const mudPath = PathConverter.toMudPath(options.filePath, normalizedMudlibRoot);
    const artifacts = discoverMudlibLocalCompileArtifacts(normalizedMudlibRoot);

    const executablePath = resolveConfiguredOrDetectedPath(
        options.settings?.lpccPath,
        options.workspaceRoot,
        normalizedMudlibRoot,
        artifacts.lpccPaths,
        '手动配置的 lpcc.exe 不存在',
        '手动配置的 lpcc.exe 必须位于当前 mudlib 目录内',
        'mudlib 目录下未找到 lpcc.exe，请将 lpcc.exe 放到 mudlib 目录下或手动指定路径'
    );
    const configPath = resolveConfiguredOrDetectedPath(
        options.settings?.configPath,
        options.workspaceRoot,
        normalizedMudlibRoot,
        artifacts.configPaths,
        '手动配置的配置文件不存在',
        '手动配置的配置文件必须位于当前 mudlib 目录内',
        'mudlib 目录下未找到 config.ini 或 config.cfg，请将配置文件放到 mudlib 目录下或手动指定路径'
    );

    return {
        mudlibRoot: normalizedMudlibRoot,
        executablePath,
        configPath,
        workingDir: path.dirname(configPath),
        mudPath
    };
}

function resolveConfiguredOrDetectedPath(
    configuredPath: string | undefined,
    workspaceRoot: string,
    mudlibRoot: string,
    detectedPaths: string[],
    configuredErrorPrefix: string,
    configuredRootErrorPrefix: string,
    detectedErrorMessage: string
): string {
    if (configuredPath?.trim()) {
        const candidate = resolvePathFromWorkspace(workspaceRoot, configuredPath.trim());
        if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
            throw new Error(`${configuredErrorPrefix}: ${configuredPath}`);
        }
        if (!isWithinRoot(mudlibRoot, candidate)) {
            throw new Error(`${configuredRootErrorPrefix}: ${configuredPath}`);
        }
        return candidate;
    }

    if (detectedPaths.length === 0) {
        throw new Error(detectedErrorMessage);
    }

    return detectedPaths[0];
}

function resolvePathFromWorkspace(workspaceRoot: string, rawPath: string): string {
    const resolvedPath = path.isAbsolute(rawPath)
        ? rawPath
        : path.resolve(workspaceRoot, rawPath);
    return path.resolve(resolvedPath);
}

function findFiles(
    rootPath: string,
    matcher: (entryPath: string, entryName: string) => boolean
): string[] {
    const results: string[] = [];

    walkDirectory(rootPath, (entryPath, entryName) => {
        if (matcher(entryPath, entryName)) {
            results.push(entryPath);
        }
    });

    return results.sort((left, right) => compareByDepthThenPath(rootPath, left, right));
}

function walkDirectory(
    currentPath: string,
    visitor: (entryPath: string, entryName: string) => void
): void {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
        const entryPath = path.join(currentPath, entry.name);
        if (entry.isDirectory()) {
            walkDirectory(entryPath, visitor);
            continue;
        }

        if (entry.isFile()) {
            visitor(entryPath, entry.name);
        }
    }
}

function isInsideRoot(rootPath: string, targetPath: string): boolean {
    const relativePath = path.relative(rootPath, targetPath);
    return !!relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
    const relativePath = path.relative(rootPath, targetPath);
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function compareByDepthThenPath(rootPath: string, left: string, right: string): number {
    const leftDepth = getRelativeDepth(rootPath, left);
    const rightDepth = getRelativeDepth(rootPath, right);

    if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
    }

    return left.localeCompare(right);
}

function compareConfigPathPriority(rootPath: string, left: string, right: string): number {
    const leftDepth = getRelativeDepth(rootPath, left);
    const rightDepth = getRelativeDepth(rootPath, right);
    if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
    }

    const leftName = path.basename(left).toLowerCase();
    const rightName = path.basename(right).toLowerCase();
    const leftPriority = CONFIG_FILE_PRIORITY.get(leftName) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = CONFIG_FILE_PRIORITY.get(rightName) ?? Number.MAX_SAFE_INTEGER;
    if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
    }

    return left.localeCompare(right);
}

function getRelativeDepth(rootPath: string, targetPath: string): number {
    const relativePath = path.relative(rootPath, targetPath);
    if (!relativePath) {
        return 0;
    }
    return relativePath.split(path.sep).length - 1;
}
