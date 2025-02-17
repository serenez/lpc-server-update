import * as vscode from 'vscode';

export class ButtonProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _isConnected: boolean = false;
    private _isLoggedIn: boolean = false;

    constructor(private readonly _extensionUri: vscode.Uri) {
        // 初始化时从配置读取状态
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        this._isConnected = config.get('isConnected', false);
        this._isLoggedIn = config.get('isLoggedIn', false);
    }

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
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理消息
        webviewView.webview.onDidReceiveMessage(async message => {
            try {
                switch (message.type) {
                    case 'ready':
                        this._isLoggedIn = true;
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
        if (!isConnected) {
            this._isLoggedIn = false; // 断开连接时自动设置为未登录
        }
        this.updateView();
    }

    public updateButtonState(isLoggedIn: boolean) {
        this._isLoggedIn = isLoggedIn;
        this.updateView();
    }

    private updateView() {
        if (this._view) {
            // 发送状态更新消息到webview
            this._view.webview.postMessage({ 
                type: 'updateState', 
                connected: this._isConnected,
                loggedIn: this._isLoggedIn
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
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
                display: flex;
                align-items: center;
                gap: 8px;
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
            .button-icon {
                font-size: 16px;
            }
            .connected {
                background: var(--vscode-statusBarItem-errorBackground);
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
                <div class="button-container">
                    <button id="compile" ${!this._isConnected || !this._isLoggedIn ? 'disabled' : ''}>
                        <span class="button-icon">🔨</span>
                        编译当前文件
                    </button>
                    <button id="compileDir" ${!this._isConnected || !this._isLoggedIn ? 'disabled' : ''}>
                        <span class="button-icon">📁</span>
                        编译目录
                    </button>
                    <button id="sendCommand" ${!this._isConnected || !this._isLoggedIn ? 'disabled' : ''}>
                        <span class="button-icon">⌨️</span>
                        发送自定义命令
                    </button>
                    <button id="restart" ${!this._isConnected || !this._isLoggedIn ? 'disabled' : ''}>
                        <span class="button-icon">🔃</span>
                        重启服务器
                    </button>
                    <button id="connect" class="connect-button">
                        <span class="button-icon">🔌</span>
                        连接游戏服务器
                    </button>
                </div>
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        let currentState = false; // 初始状态设为false
                        let isLoggedIn = false;  // 初始状态设为false

                        // 更新按钮状态
                        function updateButtonState() {
                            const buttons = document.querySelectorAll('button:not(#connect)');
                            buttons.forEach(button => {
                                button.disabled = !currentState || !isLoggedIn;
                            });
                            
                            const connectButton = document.getElementById('connect');
                            if (connectButton) {
                                if (currentState) {
                                    connectButton.innerHTML = '<span class="button-icon">🔌</span>断开服务器';
                                    connectButton.classList.add('connected');
                                } else {
                                    connectButton.innerHTML = '<span class="button-icon">🔌</span>连接游戏服务器';
                                    connectButton.classList.remove('connected');
                                }
                            }
                        }

                        // 初始化时更新按钮状态
                        updateButtonState();

                        // 监听来自扩展的消息
                        window.addEventListener('message', e => {
                            const message = e.data;
                            if (message.type === 'updateState') {
                                const newConnected = message.connected;
                                const newLoggedIn = message.loggedIn;
                                
                                if (currentState !== newConnected || isLoggedIn !== newLoggedIn) {
                                    currentState = newConnected;
                                    isLoggedIn = newLoggedIn;
                                    updateButtonState();
                                }
                            }
                        });

                        // 按钮点击事件
                        document.getElementById('compile').addEventListener('click', () => {
                            if (currentState && isLoggedIn) {
                                vscode.postMessage({ type: 'command', command: 'game-server-compiler.compileCurrentFile' });
                            }
                        });

                        document.getElementById('compileDir').addEventListener('click', () => {
                            if (currentState && isLoggedIn) {
                                vscode.postMessage({ type: 'command', command: 'game-server-compiler.compileDir' });
                            }
                        });

                        document.getElementById('sendCommand').addEventListener('click', () => {
                            if (currentState && isLoggedIn) {
                                vscode.postMessage({ type: 'command', command: 'game-server-compiler.sendCommand' });
                            }
                        });

                        document.getElementById('restart').addEventListener('click', () => {
                            if (currentState && isLoggedIn) {
                                vscode.postMessage({ type: 'command', command: 'game-server-compiler.restart' });
                            }
                        });

                        document.getElementById('connect').addEventListener('click', () => {
                            vscode.postMessage({ type: 'command', command: 'game-server-compiler.connect' });
                        });
                    })();
                </script>
            </body>
            </html>`;
    }
} 
