"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const tcpClient_1 = require("./tcpClient");
let tcpClient;
function activate(context) {
    tcpClient = new tcpClient_1.TcpClient();
    let connectDisposable = vscode.commands.registerCommand('game-server-compiler.connect', async () => {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const host = config.get('host') || 'localhost';
        const port = config.get('port') || 8080;
        try {
            await tcpClient.connect(host, port);
        }
        catch (err) {
            vscode.window.showErrorMessage(`连接失败: ${err}`);
        }
    });
    let compileDisposable = vscode.commands.registerCommand('game-server-compiler.compile', () => {
        if (!tcpClient.isConnected()) {
            vscode.window.showErrorMessage('请先连接到服务器');
            return;
        }
        tcpClient.sendCompileCommand();
    });
    context.subscriptions.push(connectDisposable, compileDisposable);
}
exports.activate = activate;
function deactivate() {
    if (tcpClient) {
        tcpClient.disconnect();
    }
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map