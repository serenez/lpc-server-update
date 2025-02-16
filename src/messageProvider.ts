import * as vscode from 'vscode';

export class MessageProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: string[] = [];
    private readonly _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'clearMessages':
                    this._messages = [];
                    this._view?.webview.postMessage({ type: 'clearMessages' });
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body {
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        position: relative;
                        height: 100vh;
                        margin: 0;
                        box-sizing: border-box;
                        background: var(--vscode-editor-background);
                    }
                    #message-container {
                        display: flex;
                        flex-direction: column;
                        height: calc(100vh - 50px);
                        overflow-y: auto;
                        padding-bottom: 40px;
                        gap: 8px;
                    }
                    #message-container::-webkit-scrollbar {
                        width: 8px;
                    }
                    #message-container::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    #message-container::-webkit-scrollbar-thumb {
                        background: var(--vscode-scrollbarSlider-background);
                        border-radius: 4px;
                    }
                    #message-container::-webkit-scrollbar-thumb:hover {
                        background: var(--vscode-scrollbarSlider-hoverBackground);
                    }
                    .message {
                        margin: 0;
                        padding: 8px 12px;
                        border-radius: 6px;
                        word-break: break-all;
                        line-height: 1.5;
                        display: flex;
                        align-items: flex-start;
                        gap: 8px;
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                        background: var(--vscode-editor-background);
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .message:hover {
                        border-color: var(--vscode-focusBorder);
                        background: var(--vscode-editor-selectionBackground);
                    }
                    .timestamp {
                        color: var(--vscode-descriptionForeground);
                        font-size: 0.9em;
                        font-family: monospace;
                        padding: 2px 4px;
                        border-radius: 3px;
                        background: var(--vscode-editor-lineHighlightBackground);
                        white-space: nowrap;
                    }
                    .icon-container {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 20px;
                        height: 20px;
                        font-size: 16px;
                    }
                    .message-content {
                        flex: 1;
                    }
                    .success { 
                        color: #4CAF50;
                        border-left: 3px solid #4CAF50;
                    }
                    .error { 
                        color: #f44336;
                        border-left: 3px solid #f44336;
                    }
                    .warning { 
                        color: #ff9800;
                        border-left: 3px solid #ff9800;
                    }
                    .info { 
                        color: #2196F3;
                        border-left: 3px solid #2196F3;
                    }
                    .system { 
                        color: #9C27B0;
                        border-left: 3px solid #9C27B0;
                    }
                    .button-container {
                        position: fixed;
                        bottom: 10px;
                        right: 10px;
                        display: flex;
                        gap: 10px;
                        z-index: 1000;
                    }
                    .action-button {
                        padding: 6px 12px;
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        font-size: 12px;
                        transition: all 0.2s ease;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    .action-button:hover {
                        background: var(--vscode-button-hoverBackground);
                        transform: translateY(-1px);
                    }
                    .action-button:active {
                        transform: translateY(0);
                    }
                    .action-button.active {
                        background: #2196F3;
                        box-shadow: 0 2px 4px rgba(33,150,243,0.3);
                    }
                    .button-icon {
                        font-size: 14px;
                        line-height: 1;
                    }
                </style>
            </head>
            <body>
                <div id="message-container">
                    ${this._messages.join('\n')}
                </div>
                <div class="button-container">
                    <button class="action-button" id="scrollLockButton" onclick="toggleScrollLock()">
                        <span class="button-icon">🔒</span>
                        <span>自动滚动</span>
                    </button>
                    <button class="action-button" onclick="clearMessages()">
                        <span class="button-icon">🗑️</span>
                        <span>清除</span>
                    </button>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const messageContainer = document.getElementById('message-container');
                    const scrollLockButton = document.getElementById('scrollLockButton');
                    let autoScroll = true;
                    
                    // 初始化按钮状态
                    scrollLockButton.classList.add('active');
                    
                    function toggleScrollLock() {
                        autoScroll = !autoScroll;
                        scrollLockButton.classList.toggle('active');
                        scrollLockButton.querySelector('.button-icon').textContent = 
                            autoScroll ? '🔒' : '🔓';
                        if (autoScroll) {
                            scrollToBottom();
                        }
                    }
                    
                    function scrollToBottom() {
                        messageContainer.scrollTop = messageContainer.scrollHeight;
                    }
                    
                    function clearMessages() {
                        vscode.postMessage({
                            command: 'clearMessages'
                        });
                    }
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'addMessage':
                                const div = document.createElement('div');
                                div.innerHTML = message.value;
                                messageContainer.appendChild(div);
                                if (autoScroll) {
                                    scrollToBottom();
                                }
                                break;
                            case 'clearMessages':
                                messageContainer.innerHTML = '';
                                break;
                        }
                    });
                </script>
            </body>
            </html>`;
    }

    public addMessage(message: string) {
        const timestamp = new Date().toLocaleTimeString();
        let type = 'info';
        let icon = '💬';

        // 根据消息内容判断类型
        if (message.includes('成功') || message.includes('完成')) {
            type = 'success';
            icon = '✅';
        } else if (message.includes('错误') || message.includes('失败')) {
            type = 'error';
            icon = '❌';
        } else if (message.includes('警告') || message.includes('注意')) {
            type = 'warning';
            icon = '⚠️';
        } else if (message.includes('系统') || message.includes('初始化')) {
            type = 'system';
            icon = '🔧';
        }

        const formattedMessage = `<div class="message ${type}">
            <span class="timestamp">[${timestamp}]</span>
            <span class="icon-container">${icon}</span>
            <span class="message-content">${message}</span>
        </div>`;

        this._messages.push(formattedMessage);
        this._view?.webview.postMessage({ type: 'addMessage', value: formattedMessage });
    }

    public dispose() {
        // 清理资源
    }
} 
