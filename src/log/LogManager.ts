import * as vscode from 'vscode';

export enum LogLevel {
    DEBUG = 'DEBUG',
    INFO = 'INFO',
    WARN = 'WARN',
    ERROR = 'ERROR'
}

export class LogManager {
    private static instance: LogManager;
    private outputChannel: vscode.OutputChannel;

    private constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    static initialize(outputChannel: vscode.OutputChannel): void {
        if (!LogManager.instance) {
            LogManager.instance = new LogManager(outputChannel);
        }
    }

    static getInstance(): LogManager {
        if (!LogManager.instance) {
            throw new Error('LogManager has not been initialized');
        }
        return LogManager.instance;
    }

    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    public log(message: string, level: LogLevel = LogLevel.INFO, context: string = '', showNotification: boolean = false) {
        const timestamp = new Date().toISOString();
        const prefix = level === LogLevel.ERROR ? '[错误]' : 
                      level === LogLevel.DEBUG ? '[调试]' : 
                      level === LogLevel.WARN ? '[警告]' : 
                      '[信息]';
        
        const formattedMessage = `[${timestamp}] ${prefix} ${context ? `[${context}] ` : ''}${message}`;
        this.outputChannel.appendLine(formattedMessage);

        if (showNotification) {
            if (level === LogLevel.ERROR) {
                vscode.window.showErrorMessage(message);
            } else if (level === LogLevel.WARN) {
                vscode.window.showWarningMessage(message);
            } else {
                vscode.window.showInformationMessage(message);
            }
        }
    }

    public logConnection(message: string) {
        this.log(message, LogLevel.INFO, 'Connection');
    }

    public logProtocol(type: 'REQUEST' | 'RESPONSE', protocolId: number, data: any) {
        this.log(`${type} | Protocol: ${protocolId} | ${JSON.stringify(data)}`, LogLevel.DEBUG, 'Protocol');
    }

    public logGame(message: string) {
        this.log(message, LogLevel.INFO, 'Game');
    }

    public logError(error: Error | string, showNotification: boolean = true) {
        const message = error instanceof Error ? error.message : error;
        this.log(message, LogLevel.ERROR, 'Error', showNotification);
        
        if (error instanceof Error && error.stack) {
            this.log(error.stack, LogLevel.DEBUG, 'Error');
        }
    }

    public showAll() {
        this.outputChannel.show(true);
    }

    dispose() {
        this.outputChannel.dispose();
    }
} 
