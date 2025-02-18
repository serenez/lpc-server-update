import * as vscode from 'vscode';

export class NetworkError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class ConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConfigError';
    }
}

export class ErrorHandler {
    static async handle(error: Error, context: string): Promise<void> {
        // 错误日志
        console.error(`[${context}] ${error.message}`);
        
        // 错误分类处理
        if (error instanceof NetworkError) {
            await this.handleNetworkError(error);
        } else if (error instanceof ConfigError) {
            await this.handleConfigError(error);
        } else {
            await this.handleGenericError(error);
        }
    }

    private static async handleNetworkError(error: NetworkError): Promise<void> {
        const message = `网络错误: ${error.message}`;
        vscode.window.showErrorMessage(message);
        
        // 触发网络错误事件
        await vscode.commands.executeCommand('gameServerCompiler.networkError', error);
    }

    private static async handleConfigError(error: ConfigError): Promise<void> {
        const message = `配置错误: ${error.message}`;
        vscode.window.showErrorMessage(message);
        
        // 打开配置文件
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (workspaceRoot) {
            const configPath = vscode.Uri.file(`${workspaceRoot}/.vscode/muy-lpc-update.json`);
            await vscode.window.showTextDocument(configPath);
        }
    }

    private static async handleGenericError(error: Error): Promise<void> {
        const message = `错误: ${error.message}`;
        vscode.window.showErrorMessage(message);
        
        // 记录到输出通道
        const outputChannel = vscode.window.createOutputChannel('LPC服务器错误');
        outputChannel.appendLine(`[${new Date().toISOString()}] ${error.stack || error.message}`);
        outputChannel.show();
    }
} 
