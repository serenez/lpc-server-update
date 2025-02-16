import * as vscode from 'vscode';
import { MessageParser } from './utils/messageParser';

export enum LogLevel {
    DEBUG,
    INFO,
    WARN,
    ERROR
}

export class LogManager {
    private static instance: LogManager;
    private connectionChannel: vscode.OutputChannel;
    private protocolChannel: vscode.OutputChannel;
    private gameChannel: vscode.OutputChannel;
    private errorChannel: vscode.OutputChannel;
    private currentLogLevel: LogLevel;
    
    private constructor() {
        this.connectionChannel = vscode.window.createOutputChannel('Game Server - Connection');
        this.protocolChannel = vscode.window.createOutputChannel('Game Server - Protocol');
        this.gameChannel = vscode.window.createOutputChannel('Game Server - Game');
        this.errorChannel = vscode.window.createOutputChannel('Game Server - Error');
        this.currentLogLevel = LogLevel.INFO;
    }

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    public logConnection(message: string) {
        const timestamp = new Date().toISOString();
        this.connectionChannel.appendLine(`[${timestamp}] ${message}`);
    }

    public logProtocol(type: 'REQUEST' | 'RESPONSE', protocolId: number, data: any) {
        const timestamp = new Date().toISOString();
        const cleanData = typeof data === 'string' ? MessageParser.cleanControlChars(data) : data;
        this.protocolChannel.appendLine(
            `[${timestamp}] ${type} | Protocol: ${protocolId} | ${JSON.stringify(cleanData)}`
        );
    }

    public logGame(message: string) {
        const timestamp = new Date().toISOString();
        const cleanMessage = MessageParser.cleanControlChars(message);
        this.gameChannel.appendLine(`[${timestamp}] ${cleanMessage}`);
    }

    public logError(error: Error | string, showNotification: boolean = true) {
        const timestamp = new Date().toISOString();
        const message = error instanceof Error ? error.message : error;
        const fullMessage = `[${timestamp}] ERROR: ${message}`;
        
        // 记录到错误通道
        this.errorChannel.appendLine(fullMessage);
        
        // 记录详细堆栈信息（如果有）
        if (error instanceof Error && error.stack) {
            this.errorChannel.appendLine(error.stack);
        }
        
        // 显示通知
        if (showNotification) {
            vscode.window.showErrorMessage(message);
        }
        
        // 显示错误通道
        this.errorChannel.show();
    }

    public showAll() {
        this.connectionChannel.show(true);
        this.protocolChannel.show(true);
        this.gameChannel.show(true);
    }

    public dispose() {
        this.connectionChannel.dispose();
        this.protocolChannel.dispose();
        this.gameChannel.dispose();
        this.errorChannel.dispose();
    }

    public log(level: LogLevel, message: string) {
        if (level >= this.currentLogLevel) {
            const timestamp = new Date().toISOString();
            const formattedMessage = `[${timestamp}][${LogLevel[level]}] ${message}`;
            this.logToChannel(level, formattedMessage);
        }
    }

    private logToChannel(level: LogLevel, message: string) {
        switch (level) {
            case LogLevel.DEBUG:
                this.connectionChannel.appendLine(message);
                break;
            case LogLevel.INFO:
                this.connectionChannel.appendLine(message);
                this.protocolChannel.appendLine(message);
                this.gameChannel.appendLine(message);
                break;
            case LogLevel.WARN:
                this.connectionChannel.appendLine(message);
                this.protocolChannel.appendLine(message);
                this.gameChannel.appendLine(message);
                break;
            case LogLevel.ERROR:
                this.connectionChannel.appendLine(message);
                this.protocolChannel.appendLine(message);
                this.gameChannel.appendLine(message);
                this.errorChannel.appendLine(message);
                this.errorChannel.show();
                break;
        }
    }
} 
