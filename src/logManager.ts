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
    private outputChannel: vscode.OutputChannel;
    private currentLogLevel: LogLevel;
    
    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('LPC服务器');
        this.currentLogLevel = LogLevel.INFO;
    }

    public static getInstance(): LogManager {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager();
        }
        return LogManager.instance;
    }

    public log(level: LogLevel, message: string) {
        if (level >= this.currentLogLevel) {
            const timestamp = new Date().toISOString();
            const prefix = level === LogLevel.ERROR ? '[错误]' : 
                          level === LogLevel.DEBUG ? '[调试]' : 
                          level === LogLevel.WARN ? '[警告]' : 
                          '[信息]';
            this.outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);
        }
    }

    public dispose() {
        this.outputChannel.dispose();
    }
} 
