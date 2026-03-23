import * as path from 'path';
import * as fs from 'fs';
import { ValidationError } from '../errors';

export class PathConverter {
    private static readonly ROOT_MARKER_DIRS = ['log', 'adm', 'cmds', 'feature', 'include', 'std', 'inherit'];
    private static readonly MIN_MARKER_MATCH_COUNT = 3;

    static findMudProjectRootFromFile(fullPath: string): string | null {
        if (!fullPath) {
            return null;
        }

        let currentDir = path.dirname(path.resolve(fullPath));
        const parsedRoot = path.parse(currentDir).root;

        while (true) {
            const markerMatches = this.ROOT_MARKER_DIRS.filter((dirName) => {
                const dirPath = path.join(currentDir, dirName);
                return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
            });

            if (markerMatches.length >= this.MIN_MARKER_MATCH_COUNT) {
                return currentDir;
            }

            if (currentDir === parsedRoot) {
                break;
            }
            currentDir = path.dirname(currentDir);
        }

        return null;
    }

    static resolveMudPathAutoRoot(
        fullPath: string,
        workspaceRoot?: string,
        configuredRootPath?: string
    ): { mudPath: string; usedRootPath: string } {
        const detectedProjectRoot = this.findMudProjectRootFromFile(fullPath);
        if (detectedProjectRoot) {
            return {
                mudPath: this.toMudPath(fullPath, detectedProjectRoot),
                usedRootPath: detectedProjectRoot
            };
        }

        if (workspaceRoot) {
            try {
                return {
                    mudPath: this.toMudPath(fullPath, workspaceRoot),
                    usedRootPath: workspaceRoot
                };
            } catch {
                // continue
            }
        }

        if (configuredRootPath) {
            return {
                mudPath: this.toMudPath(fullPath, configuredRootPath),
                usedRootPath: configuredRootPath
            };
        }

        throw new ValidationError('路径转换失败: 无法识别项目根目录');
    }

    static resolveMudPathWithRoot(
        fullPath: string,
        configuredRootPath: string,
        fallbackRootPath?: string
    ): { mudPath: string; usedRootPath: string } {
        try {
            return {
                mudPath: this.toMudPath(fullPath, configuredRootPath),
                usedRootPath: configuredRootPath
            };
        } catch (primaryError) {
            if (fallbackRootPath && fallbackRootPath !== configuredRootPath) {
                try {
                    return {
                        mudPath: this.toMudPath(fullPath, fallbackRootPath),
                        usedRootPath: fallbackRootPath
                    };
                } catch {
                    // ignore fallback error and throw a combined diagnostic error below
                }
            }

            const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
            throw new ValidationError(
                `路径转换失败: configuredRootPath=${configuredRootPath}, file=${fullPath}, reason=${primaryMessage}`
            );
        }
    }

    static resolveLocalPathWithRoot(
        mudPath: string,
        preferredRootPath: string,
        fallbackRootPath?: string
    ): { localPath: string; usedRootPath: string } {
        try {
            return {
                localPath: this.toLocalPath(mudPath, preferredRootPath),
                usedRootPath: preferredRootPath
            };
        } catch (primaryError) {
            if (fallbackRootPath && fallbackRootPath !== preferredRootPath) {
                try {
                    return {
                        localPath: this.toLocalPath(mudPath, fallbackRootPath),
                        usedRootPath: fallbackRootPath
                    };
                } catch {
                    // ignore fallback error and throw a combined diagnostic error below
                }
            }

            const primaryMessage = primaryError instanceof Error ? primaryError.message : String(primaryError);
            throw new ValidationError(
                `路径转换失败: preferredRootPath=${preferredRootPath}, mudPath=${mudPath}, reason=${primaryMessage}`
            );
        }
    }

    static toMudPath(fullPath: string, rootPath: string): string {
        try {
            if (!fullPath || !rootPath) {
                throw new ValidationError('路径参数不能为空');
            }

            let relativePath = path.relative(rootPath, fullPath);
            if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                throw new ValidationError('非法的路径');
            }
            relativePath = relativePath.replace(/\\/g, '/');
            
            if (!relativePath.startsWith('/')) {
                relativePath = '/' + relativePath;
            }
            
            return relativePath.replace(/\.[^/.]+$/, "");
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ValidationError(`路径转换失败: ${errorMessage}`);
        }
    }

    static toMudPathWithFallbackRoot(
        fullPath: string,
        configuredRootPath: string,
        fallbackRootPath?: string
    ): string {
        return this.resolveMudPathWithRoot(fullPath, configuredRootPath, fallbackRootPath).mudPath;
    }

    static toLocalPath(mudPath: string, rootPath: string): string {
        try {
            if (!mudPath || !rootPath) {
                throw new ValidationError('路径参数不能为空');
            }

            const normalizedRootPath = path.resolve(rootPath);
            const normalizedPath = mudPath.replace(/\\/g, '/').replace(/^\/+/, '');
            const fullPath = path.resolve(normalizedRootPath, normalizedPath);
            const relativePath = path.relative(normalizedRootPath, fullPath);

            if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
                throw new ValidationError('非法的路径');
            }
            
            return fullPath;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ValidationError(`路径转换失败: ${errorMessage}`);
        }
    }

    static isValidPath(filePath: string): boolean {
        try {
            path.parse(filePath);
            return true;
        } catch {
            return false;
        }
    }

    static isCompilableFile(filePath: string): boolean {
        if (!this.isValidPath(filePath)) {
            return false;
        }
        const ext = path.extname(filePath).toLowerCase();
        return ['.c', '.h', '.lpc'].includes(ext);
    }
} 
