import * as vscode from 'vscode';

export class MessageProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: string[] = [];

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

        webviewView.webview.html = this._getHtmlForWebview();

        // 保持消息滚动到底部
        webviewView.webview.onDidReceiveMessage(message => {
            if (message.type === 'ready') {
                this._messages.forEach(msg => this.addMessage(msg));
            }
        });
    }

    public addMessage(message: string, isError: boolean = false) {
        this._messages.push(message);
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'addMessage', 
                message,
                isError 
            });
        }
    }

    public clearMessages() {
        this._messages = [];
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearMessages' });
        }
    }

    private _getHtmlForWebview() {
        const messageStyle = `
            body {
                padding: 0;
                margin: 0;
                font-family: var(--vscode-font-family);
                font-size: var(--vscode-font-size);
                color: var(--vscode-foreground);
                background: var(--vscode-editor-background);
                height: 100vh;
                overflow: hidden;
            }
            #message-container {
                padding: 5px;
                overflow-y: auto;
                height: calc(100vh - 10px);
                word-wrap: break-word;
                white-space: pre-wrap;
                box-sizing: border-box;
            }
            .message {
                margin-bottom: 2px;
                padding: 2px;
                border-bottom: 1px solid var(--vscode-panel-border);
                font-size: 12px;
                line-height: 1.3;
            }
            .error-message {
                color: var(--vscode-errorForeground);
            }
            .info-message {
                color: var(--vscode-foreground);
            }
        `;

        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>${messageStyle}</style>
        </head>
        <body>
            <div id="message-container"></div>
            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const container = document.getElementById('message-container');
                    let messageCount = 0;
                    const maxMessages = 500;

                    function addMessage(message, isError = false) {
                        const div = document.createElement('div');
                        div.className = \`message \${isError ? 'error-message' : 'info-message'}\`;
                        div.textContent = message;
                        container.appendChild(div);
                        
                        messageCount++;
                        if (messageCount > maxMessages) {
                            container.removeChild(container.firstChild);
                            messageCount--;
                        }
                        
                        requestAnimationFrame(() => {
                            container.scrollTop = container.scrollHeight;
                        });
                    }

                    function clearMessages() {
                        container.innerHTML = '';
                        messageCount = 0;
                    }

                    window.addEventListener('message', (e) => {
                        const message = e.data;
                        switch (message.type) {
                            case 'addMessage':
                                addMessage(message.message, message.isError);
                                break;
                            case 'clearMessages':
                                clearMessages();
                                break;
                        }
                    });

                    vscode.postMessage({ type: 'ready' });
                })();
            </script>
        </body>
        </html>`;
    }

    public dispose() {
        this._messages = [];
        if (this._view) {
            this._view.webview.html = '';
            this._view = undefined;
        }
    }
} 
