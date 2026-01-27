import * as vscode from 'vscode';
import { LogManager, LogLevel } from '../log/LogManager';

/**
 * 🚀 错误严重程度枚举
 */
export enum ErrorSeverity {
    /** 可恢复的错误（如临时网络问题） */
    RECOVERABLE = 'recoverable',
    /** 需要用户干预的错误（如配置错误） */
    USER_ACTION_REQUIRED = 'user_action_required',
    /** 致命错误（无法恢复） */
    FATAL = 'fatal'
}

/**
 * 🚀 错误类别枚举
 */
export enum ErrorCategory {
    /** 网络相关错误 */
    NETWORK = 'network',
    /** 配置相关错误 */
    CONFIG = 'config',
    /** 编译相关错误 */
    COMPILE = 'compile',
    /** 认证相关错误 */
    AUTH = 'auth',
    /** 文件系统错误 */
    FILESYSTEM = 'filesystem',
    /** 未知错误 */
    UNKNOWN = 'unknown'
}

/**
 * 🚀 增强的错误信息接口
 */
export interface ErrorDetail {
    /** 错误类别 */
    category: ErrorCategory;
    /** 错误严重程度 */
    severity: ErrorSeverity;
    /** 用户友好的错误消息 */
    userMessage: string;
    /** 修复建议 */
    suggestions: string[];
    /** 是否可以重试 */
    retryable: boolean;
    /** 最大重试次数 */
    maxRetries?: number;
    /** 重试延迟（毫秒） */
    retryDelay?: number;
}

// 基础错误类
export class BaseError extends Error {
    constructor(
        message: string,
        public detail: ErrorDetail
    ) {
        super(message);
        this.name = this.constructor.name;
    }
}

// 网络错误
export class NetworkError extends BaseError {
    constructor(message: string, errorCode?: string) {
        const detail = ErrorHandler.categorizeNetworkError(message, errorCode);
        super(`网络错误: ${message}`, detail);
    }
}

// 配置错误
export class ConfigError extends BaseError {
    constructor(
        message: string,
        public configPath?: string
    ) {
        const detail = ErrorHandler.categorizeConfigError(message);
        super(`配置错误: ${message}`, detail);
    }
}

// 编译错误
export class CompileError extends BaseError {
    constructor(
        message: string,
        public file?: string,
        public line?: number
    ) {
        const detail = ErrorHandler.categorizeCompileError(message);
        super(`编译错误: ${message}`, detail);
    }
}

/**
 * 🚀 增强的错误处理器
 */
export class ErrorHandler {
    private static readonly logger = LogManager.getInstance();
    private static readonly retryAttempts: Map<string, number> = new Map();

    /**
     * 处理错误
     */
    static handle(error: Error, context: string): void {
        const errorDetail = error instanceof BaseError ? error.detail : null;

        // 记录错误
        this.logger.log(
            `[${context}] ${error.message}\n${error.stack}`,
            LogLevel.ERROR
        );

        // 根据错误类型和严重程度处理
        if (error instanceof BaseError && errorDetail) {
            this.handleStructuredError(error, errorDetail);
        } else if (error instanceof Error) {
            this.handleUnknownError(error);
        }
    }

    /**
     * 🚀 处理结构化错误
     */
    private static handleStructuredError(error: BaseError, detail: ErrorDetail): void {
        // 显示用户友好的错误消息
        vscode.window.showErrorMessage(
            detail.userMessage,
            ...detail.suggestions.map(s => ({ title: s }))
        );

        // 根据严重程度采取额外行动
        switch (detail.severity) {
            case ErrorSeverity.RECOVERABLE:
                this.logger.log('这是一个可恢复的错误', LogLevel.INFO);
                break;

            case ErrorSeverity.USER_ACTION_REQUIRED:
                this.logger.log('需要用户操作来解决这个问题', LogLevel.WARN);
                if (error instanceof ConfigError && error.configPath) {
                    this.openConfigFile(error.configPath);
                }
                break;

            case ErrorSeverity.FATAL:
                this.logger.log('这是一个致命错误，无法恢复', LogLevel.ERROR);
                break;
        }
    }

    /**
     * 🚀 分类网络错误
     */
    public static categorizeNetworkError(message: string, errorCode?: string): ErrorDetail {
        // 连接被拒绝
        if (message.includes('ECONNREFUSED') || errorCode === 'ECONNREFUSED') {
            return {
                category: ErrorCategory.NETWORK,
                severity: ErrorSeverity.USER_ACTION_REQUIRED,
                userMessage: '无法连接到服务器，请检查服务器地址和端口是否正确',
                suggestions: [
                    '检查服务器是否正在运行',
                    '验证配置中的服务器地址和端口',
                    '检查网络连接',
                    '查看防火墙设置'
                ],
                retryable: true,
                maxRetries: 3,
                retryDelay: 5000
            };
        }

        // 连接超时
        if (message.includes('ETIMEDOUT') || errorCode === 'ETIMEDOUT') {
            return {
                category: ErrorCategory.NETWORK,
                severity: ErrorSeverity.RECOVERABLE,
                userMessage: '连接超时，服务器可能繁忙或网络不稳定',
                suggestions: [
                    '检查网络连接',
                    '稍后重试',
                    '检查服务器负载'
                ],
                retryable: true,
                maxRetries: 5,
                retryDelay: 10000
            };
        }

        // 找不到服务器
        if (message.includes('ENOTFOUND') || errorCode === 'ENOTFOUND') {
            return {
                category: ErrorCategory.NETWORK,
                severity: ErrorSeverity.USER_ACTION_REQUIRED,
                userMessage: '找不到服务器，请检查服务器地址是否正确',
                suggestions: [
                    '验证服务器地址拼写',
                    '检查DNS设置',
                    '尝试使用IP地址代替域名'
                ],
                retryable: false
            };
        }

        // 默认网络错误
        return {
            category: ErrorCategory.NETWORK,
            severity: ErrorSeverity.RECOVERABLE,
            userMessage: message,
            suggestions: ['检查网络连接', '重试连接'],
            retryable: true,
            maxRetries: 3,
            retryDelay: 5000
        };
    }

    /**
     * 🚀 分类配置错误
     */
    public static categorizeConfigError(message: string): ErrorDetail {
        if (message.includes('配置文件不存在')) {
            return {
                category: ErrorCategory.CONFIG,
                severity: ErrorSeverity.USER_ACTION_REQUIRED,
                userMessage: '配置文件不存在，需要创建配置文件',
                suggestions: [
                    '创建 muy-lpc-update.json 配置文件',
                    '参考文档配置所有必需字段'
                ],
                retryable: false
            };
        }

        if (message.includes('服务器密钥未配置')) {
            return {
                category: ErrorCategory.CONFIG,
                severity: ErrorSeverity.USER_ACTION_REQUIRED,
                userMessage: '服务器密钥未配置',
                suggestions: [
                    '在配置文件中添加 serverKey 字段',
                    '从服务器管理员获取正确的密钥'
                ],
                retryable: false
            };
        }

        if (message.includes('用户名') || message.includes('密码')) {
            return {
                category: ErrorCategory.AUTH,
                severity: ErrorSeverity.USER_ACTION_REQUIRED,
                userMessage: '用户认证信息配置错误',
                suggestions: [
                    '检查用户名和密码是否正确',
                    '确保账号已激活'
                ],
                retryable: false
            };
        }

        // 默认配置错误
        return {
            category: ErrorCategory.CONFIG,
            severity: ErrorSeverity.USER_ACTION_REQUIRED,
            userMessage: message,
            suggestions: ['检查配置文件', '参考文档'],
            retryable: false
        };
    }

    /**
     * 🚀 分类编译错误
     */
    public static categorizeCompileError(message: string): ErrorDetail {
        return {
            category: ErrorCategory.COMPILE,
            severity: ErrorSeverity.USER_ACTION_REQUIRED,
            userMessage: '编译失败，请检查代码',
            suggestions: [
                '查看错误详情',
                '修复语法错误',
                '检查文件路径'
            ],
            retryable: false
        };
    }

    /**
     * 🚀 带重试的操作执行
     */
    static async withRetry<T>(
        operation: () => Promise<T>,
        context: string,
        maxRetries: number = 3,
        delay: number = 1000
    ): Promise<T> {
        const retryKey = `${context}_${Date.now()}`;
        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));

                // 如果是最后一次尝试，不再重试
                if (attempt === maxRetries) {
                    this.logger.log(
                        `${context} 失败，已达到最大重试次数 (${maxRetries})`,
                        LogLevel.ERROR
                    );
                    throw lastError;
                }

                // 检查错误是否可重试
                if (lastError instanceof BaseError && !lastError.detail.retryable) {
                    this.logger.log(
                        `${context} 失败，错误不可重试`,
                        LogLevel.ERROR
                    );
                    throw lastError;
                }

                // 记录重试
                this.logger.log(
                    `${context} 失败 (尝试 ${attempt + 1}/${maxRetries + 1})，${delay}ms 后重试`,
                    LogLevel.WARN
                );

                // 等待后重试
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError;
    }

    /**
     * 处理未知错误
     */
    private static handleUnknownError(error: Error): void {
        vscode.window.showErrorMessage(`未知错误: ${error.message}`);
    }

    /**
     * 打开配置文件
     */
    private static async openConfigFile(configPath: string): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(configPath);
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`无法打开配置文件: ${configPath}`);
        }
    }

    /**
     * 创建诊断信息
     */
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
