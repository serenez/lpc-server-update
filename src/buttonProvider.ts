import * as vscode from 'vscode';

export class ButtonProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _isConnected: boolean = false;
    private _isReady: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 设置初始HTML
        webviewView.webview.html = this._getHtmlForWebview();

        // 处理消息
        webviewView.webview.onDidReceiveMessage(async message => {
            try {
                switch (message.type) {
                    case 'ready':
                        this._isReady = true;
                        break;
                    case 'command':
                        if (message.command) {
                            await vscode.commands.executeCommand(message.command);
                        }
                        break;
                }
            } catch (error) {
                console.error('命令执行错误:', error);
                vscode.window.showErrorMessage(`命令执行失败: ${error}`);
            }
        });
    }

    public updateConnectionState(isConnected: boolean) {
        this._isConnected = isConnected;
        if (this._view && this._isReady) {
            this._view.webview.postMessage({ 
                type: 'updateState', 
                isConnected 
            });
        }
    }

    private _getHtmlForWebview() {
        const buttonStyle = `
            body {
                padding: 0;
                margin: 0;
                height: 100vh;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            }
            button {
                width: 100%;
                padding: 10px;
                margin: 5px 0;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 13px;
                font-weight: normal;
            }
            button:hover {
                background: var(--vscode-button-hoverBackground);
            }
            button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .button-container {
                display: flex;
                flex-direction: column;
                gap: 5px;
                padding: 10px;
                height: 100%;
                box-sizing: border-box;
            }
            .connect-button {
                background: var(--vscode-statusBar-debuggingBackground);
            }
        `;

        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${buttonStyle}</style>
        </head>
        <body>
            <div id="buttons" class="button-container">
                <button id="compile" ${!this._isConnected ? 'disabled' : ''}>编译当前文件</button>
                <button id="compileDir" ${!this._isConnected ? 'disabled' : ''}>编译目录</button>
                <button id="sendCommand" ${!this._isConnected ? 'disabled' : ''}>发送自定义命令</button>
                <button id="restart" ${!this._isConnected ? 'disabled' : ''}>重启服务器</button>
                <button id="connect" class="connect-button">${this._isConnected ? '断开服务器' : '连接游戏服务器'}</button>
            </div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const buttons = document.getElementById('buttons');
                    let currentState = ${this._isConnected};
                    
                    buttons.addEventListener('click', (e) => {
                        const target = e.target;
                        if (target.tagName === 'BUTTON') {
                            const buttonId = target.id;
                            if (buttonId) {
                                try {
                                    // 映射按钮ID到完整的命令ID
                                    const commandMap = {
                                        'compile': 'game-server-compiler.compileCurrentFile',
                                        'compileDir': 'game-server-compiler.compileDir',
                                        'sendCommand': 'game-server-compiler.sendCommand',
                                        'restart': 'game-server-compiler.restart',
                                        'connect': 'game-server-compiler.connect'
                                    };

                                    const command = commandMap[buttonId];
                                    if (command) {
                                        vscode.postMessage({ 
                                            type: 'command', 
                                            command: command 
                                        });
                                    }
                                } catch (error) {
                                    console.error('按钮点击处理错误:', error);
                                }
                            }
                        }
                    });

                    window.addEventListener('message', (e) => {
                        const message = e.data;
                        if (message.type === 'updateState') {
                            const isConnected = message.isConnected;
                            if (currentState !== isConnected) {
                                currentState = isConnected;
                                
                                document.getElementById('compile').disabled = !isConnected;
                                document.getElementById('compileDir').disabled = !isConnected;
                                document.getElementById('sendCommand').disabled = !isConnected;
                                document.getElementById('restart').disabled = !isConnected;
                                
                                const connectButton = document.getElementById('connect');
                                connectButton.textContent = isConnected ? '断开服务器' : '连接游戏服务器';
                            }
                        }
                    });

                    vscode.postMessage({ type: 'ready' });
                })();
            </script>
        </body>
        </html>`;
    }
} 
