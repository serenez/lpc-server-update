import * as vscode from 'vscode';
import * as net from 'net';
import { LogManager } from './logManager';
import { MessageParser } from './utils/messageParser';

export class Connection {
    private socket: net.Socket | null = null;
    private isConnected: boolean = false;

    constructor() {
        LogManager.getInstance().showAll();
    }

    public async connect(host: string, port: number) {
        try {
            this.socket = new net.Socket();
            
            LogManager.getInstance().logConnection(`正在连接到 ${host}:${port}`);
            
            const connectPromise = new Promise<void>((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error('Socket not initialized'));
                    return;
                }

                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 5000);
                
                this.socket.connect(port, host, () => {
                    clearTimeout(timeout);
                    resolve();
                });
            });
            
            await connectPromise;

            this.isConnected = true;
            LogManager.getInstance().logConnection('已连接到游戏服务器');

            this.socket.on('data', (data) => this.handleData(data));
            
            this.socket.on('error', (error) => {
                LogManager.getInstance().logError(error);
                this.isConnected = false;
            });

            this.socket.on('close', () => {
                LogManager.getInstance().logConnection('连接已关闭');
                this.isConnected = false;
            });

        } catch (error) {
            this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    public async sendMessage(protocolId: number, data: any) {
        if (!this.socket || !this.isConnected) {
            throw new Error('Not connected to server');
        }

        LogManager.getInstance().logProtocol('REQUEST', protocolId, data);
        
        const message = {
            protocol: protocolId,
            data: data
        };

        this.socket.write(JSON.stringify(message) + '\n');
    }

    private handleData(data: Buffer) {
        const messages = data.toString().split('\n').filter(msg => msg);
        
        for (const msg of messages) {
            try {
                const protocolId = MessageParser.parseProtocol(msg);
                if (protocolId) {
                    LogManager.getInstance().logProtocol('RESPONSE', protocolId, msg);
                } else {
                    LogManager.getInstance().logGame(msg);
                }
            } catch (error) {
                LogManager.getInstance().logError(
                    error instanceof Error ? error : new Error(String(error))
                );
            }
        }
    }

    public disconnect() {
        if (this.socket) {
            this.socket.end();
            this.socket = null;
            this.isConnected = false;
        }
    }

    private handleConnectionError(error: Error) {
        LogManager.getInstance().logError(error);
        this.isConnected = false;
    }
} 
