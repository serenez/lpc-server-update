"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TcpClient = void 0;
const net = require("net");
const vscode = require("vscode");
class TcpClient {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.socket = new net.Socket();
        this.socket.on('connect', () => {
            this.connected = true;
            vscode.window.showInformationMessage('已连接到游戏服务器');
        });
        this.socket.on('error', (err) => {
            vscode.window.showErrorMessage(`连接错误: ${err.message}`);
            this.connected = false;
        });
        this.socket.on('close', () => {
            this.connected = false;
            vscode.window.showInformationMessage('与服务器断开连接');
        });
        this.socket.on('data', (data) => {
            vscode.window.showInformationMessage(`服务器返回: ${data.toString()}`);
        });
    }
    async connect(host, port) {
        return new Promise((resolve, reject) => {
            this.socket?.connect(port, host, () => {
                resolve();
            });
        });
    }
    sendCompileCommand() {
        if (!this.connected || !this.socket) {
            vscode.window.showErrorMessage('未连接到服务器');
            return;
        }
        this.socket.write('COMPILE\n');
    }
    disconnect() {
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
    }
    isConnected() {
        return this.connected;
    }
}
exports.TcpClient = TcpClient;
//# sourceMappingURL=tcpClient.js.map
