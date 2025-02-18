import * as path from 'path';
import { ValidationError } from '../errors';

export class PathConverter {
    static toMudPath(fullPath: string, rootPath: string): string {
        try {
            if (!fullPath || !rootPath) {
                throw new ValidationError('路径参数不能为空');
            }

            let relativePath = path.relative(rootPath, fullPath);
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

    static toLocalPath(mudPath: string, rootPath: string): string {
        try {
            if (!mudPath || !rootPath) {
                throw new ValidationError('路径参数不能为空');
            }

            const normalizedPath = path.normalize(mudPath).replace(/\\/g, '/');
            const fullPath = path.join(rootPath, normalizedPath);
            
            if (!fullPath.startsWith(rootPath)) {
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
