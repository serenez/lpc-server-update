import * as vscode from 'vscode';
import { LogManager, LogLevel } from '../log/LogManager';

// 基础错误类
export class BaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

// 网络错误
export class NetworkError extends BaseError {
    constructor(message: string) {
        super(`网络错误: ${message}`);
    }
}

// 配置错误
export class ConfigError extends BaseError {
    constructor(message: string, public configPath?: string) {
        super(`配置错误: ${message}`);
    }
}

// 编译错误
export class CompileError extends BaseError {
    constructor(
        message: string,
        public file?: string,
        public line?: number
    ) {
        super(`编译错误: ${message}`);
    }
}

// 错误处理器
export class ErrorHandler {
    private static readonly logger = LogManager.getInstance();

    static handle(error: Error, context: string): void {
        // 记录错误
        this.logger.log(
            `[${context}] ${error.message}\n${error.stack}`,
            LogLevel.ERROR
        );

        // 根据错误类型处理
        if (error instanceof NetworkError) {
            this.handleNetworkError(error);
        } else if (error instanceof ConfigError) {
            this.handleConfigError(error);
        } else if (error instanceof CompileError) {
            this.handleCompileError(error);
        } else {
            this.handleUnknownError(error);
        }
    }

    private static handleNetworkError(error: NetworkError): void {
        vscode.window.showErrorMessage(error.message);
    }

    private static handleConfigError(error: ConfigError): void {
        vscode.window.showErrorMessage(error.message);
        // 如果有配置文件路径,打开配置文件
        if (error.configPath) {
            vscode.workspace.openTextDocument(error.configPath)
                .then(doc => vscode.window.showTextDocument(doc));
        }
    }

    private static handleCompileError(error: CompileError): void {
        vscode.window.showErrorMessage(error.message);
        // 如果有文件和行号信息,跳转到错误位置
        if (error.file && error.line) {
            const position = new vscode.Position(error.line - 1, 0);
            vscode.workspace.openTextDocument(error.file)
                .then(doc => vscode.window.showTextDocument(doc))
                .then(editor => {
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position));
                });
        }
    }

    private static handleUnknownError(error: Error): void {
        vscode.window.showErrorMessage(`未知错误: ${error.message}`);
    }

    // 创建诊断信息
    static createDiagnostic(
        file: string,
        line: number,
        message: string
    ): vscode.Diagnostic {
        const range = new vscode.Range(
            new vscode.Position(line - 1, 0),
            new vscode.Position(line - 1, Number.MAX_VALUE)
        );
        return new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error
        );
    }
} 
