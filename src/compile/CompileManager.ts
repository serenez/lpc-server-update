import * as vscode from 'vscode';
import * as path from 'path';
import { IDisposable } from '../interfaces/IDisposable';
import { ConfigManager } from '../config/ConfigManager';
import { LogManager, LogLevel } from '../log/LogManager';
import { TcpClient } from '../tcpClient';
import { CompileError } from '../errors';
import { ServiceLocator } from '../ServiceLocator';

export class CompileManager implements IDisposable {
    private static instance: CompileManager | null = null;
    private configManager: ConfigManager;
    private logManager: LogManager;
    private tcpClient: TcpClient;

    private constructor() {
        // 使用全局存储的 ServiceLocator 实例
        const serviceLocator = ServiceLocator.getInstance();
        this.configManager = serviceLocator.getService('configManager');
        this.logManager = serviceLocator.getService('logManager');
        this.tcpClient = serviceLocator.getService('tcpClient');
    }

    static getInstance(): CompileManager {
        if (CompileManager.instance === null) {
            CompileManager.instance = new CompileManager();
        }
        return CompileManager.instance;
    }

    isCompilableFile(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();
        return ext === '.c' || ext === '.h' || ext === '.lpc';
    }

    convertToMudPath(fullPath: string): string {
        try {
            const config = this.configManager.getConfig();
            let relativePath = path.relative(config.rootPath, fullPath);
            relativePath = relativePath.replace(/\\/g, '/');
            
            // 确保路径以/开头
            if (!relativePath.startsWith('/')) {
                relativePath = '/' + relativePath;
            }
            
            // 移除文件扩展名
            return relativePath.replace(/\.[^/.]+$/, "");
        } catch (error) {
            this.logManager.log(`路径转换失败: ${error}`, LogLevel.ERROR, 'CompileManager');
            throw new CompileError(`路径转换失败: ${error}`);
        }
    }

    async compileFile(filePath: string): Promise<boolean> {
        try {
            if (!this.tcpClient.isConnected() || !this.tcpClient.isLoggedIn()) {
                throw new CompileError('请先连接服务器并确保角色已登录');
            }

            if (!this.isCompilableFile(filePath)) {
                throw new CompileError('不支持的文件类型');
            }

            const mudPath = this.convertToMudPath(filePath);
            this.logManager.log(`编译文件: ${mudPath}`, LogLevel.INFO, 'CompileManager');

            const config = this.configManager.getConfig();
            if (config.compile.showDetails) {
                vscode.window.showInformationMessage(`正在编译: ${mudPath}`);
            }

            await this.tcpClient.sendUpdateCommand(mudPath);
            return true;
        } catch (error) {
            this.logManager.log(`编译失败: ${error}`, LogLevel.ERROR, 'CompileManager');
            vscode.window.showErrorMessage(`编译失败: ${error}`);
            return false;
        }
    }

    async compileDirectory(dirPath: string): Promise<boolean> {
        try {
            if (!this.tcpClient.isConnected() || !this.tcpClient.isLoggedIn()) {
                throw new CompileError('请先连接服务器并确保角色已登录');
            }

            const config = this.configManager.getConfig();
            this.logManager.log(`编译目录: ${dirPath}`, LogLevel.INFO, 'CompileManager');

            if (config.compile.showDetails) {
                vscode.window.showInformationMessage(`正在编译目录: ${dirPath}`);
            }

            // 设置编译超时
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new CompileError('编译超时')), config.compile.timeout);
            });

            // 执行编译命令
            const compilePromise = this.tcpClient.sendCustomCommand(`updateall ${dirPath}`);

            // 使用Promise.race来处理超时
            await Promise.race([compilePromise, timeoutPromise]);
            return true;
        } catch (error) {
            this.logManager.log(`编译目录失败: ${error}`, LogLevel.ERROR, 'CompileManager');
            vscode.window.showErrorMessage(`编译目录失败: ${error}`);
            return false;
        }
    }

    dispose(): void {
        CompileManager.instance = null;
    }
} 
