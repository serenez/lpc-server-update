import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class LogManager {
    private static instance: LogManager;
    private debugChannel: vscode.OutputChannel;
    private serverChannel: vscode.OutputChannel;
    private errorChannel: vscode.OutputChannel;

    private constructor() {
        this.debugChannel = vscode.window.createOutputChannel('LPC服务器调试');
        this.serverChannel = vscode.window.createOutputChannel('LPC服务器日志');
        this.errorChannel = vscode.window.createOutputChannel('LPC服务器错误');
    }

    static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    log(message: string, level: LogLevel = LogLevel.INFO, context: string = '') {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] [${level}] ${context ? `[${context}] ` : ''}${message}`;

        switch (level) {
            case LogLevel.DEBUG:
                this.debugChannel.appendLine(formattedMessage);
                break;
            case LogLevel.INFO:
                this.serverChannel.appendLine(formattedMessage);
                break;
            case LogLevel.WARN:
                this.serverChannel.appendLine(formattedMessage);
                vscode.window.showWarningMessage(message);
                break;
            case LogLevel.ERROR:
                this.errorChannel.appendLine(formattedMessage);
                vscode.window.showErrorMessage(message);
                break;
        }
    }

    showDebugChannel() {
        this.debugChannel.show();
    }

    showServerChannel() {
        this.serverChannel.show();
    }

    showErrorChannel() {
        this.errorChannel.show();
    }

    dispose() {
        this.debugChannel.dispose();
        this.serverChannel.dispose();
        this.errorChannel.dispose();
    }
} 
