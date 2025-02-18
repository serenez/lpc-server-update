import * as vscode from 'vscode';
import { IDisposable } from '../interfaces/IDisposable';
import { EventEmitter } from 'events';

export interface ConnectionStateData {
    connected: boolean;
    loggedIn: boolean;
    reconnecting: boolean;
    lastHost: string;
    lastPort: number;
    reconnectAttempts: number;
}

export class ConnectionState implements IDisposable {
    private static instance: ConnectionState | null = null;
    private state: ConnectionStateData;
    private eventEmitter: EventEmitter;

    private constructor() {
        this.state = {
            connected: false,
            loggedIn: false,
            reconnecting: false,
            lastHost: '',
            lastPort: 0,
            reconnectAttempts: 0
        };
        this.eventEmitter = new EventEmitter();
    }

    static getInstance(): ConnectionState {
        if (ConnectionState.instance === null) {
            ConnectionState.instance = new ConnectionState();
        }
        return ConnectionState.instance;
    }

    async updateState(newState: Partial<ConnectionStateData>): Promise<void> {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        await this.notifyStateChange(oldState, this.state);
    }

    private async notifyStateChange(oldState: ConnectionStateData, newState: ConnectionStateData): Promise<void> {
        // 更新VS Code命令上下文
        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isConnected', newState.connected);
        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', newState.loggedIn);

        // 更新状态栏
        this.updateStatusBar(newState);

        // 触发状态变化事件
        this.eventEmitter.emit('stateChanged', { oldState, newState });
    }

    private updateStatusBar(state: ConnectionStateData): void {
        const statusText = state.connected 
            ? (state.loggedIn ? '已登录' : '已连接') 
            : '未连接';
        
        vscode.window.setStatusBarMessage(`LPC服务器: ${statusText}`, 3000);
    }

    getState(): ConnectionStateData {
        return { ...this.state };
    }

    onStateChanged(listener: (event: { oldState: ConnectionStateData; newState: ConnectionStateData }) => void): void {
        this.eventEmitter.on('stateChanged', listener);
    }

    dispose(): void {
        this.eventEmitter.removeAllListeners();
        ConnectionState.instance = null;
    }
} 
