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
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const colors = config.get<any>('messages.colors', {
            success: '#4CAF50',
            error: '#f44336',
            warning: '#ff9800',
            info: '#2196F3',
            system: '#9C27B0'
        });
        const showIcons = config.get<boolean>('messages.showIcons', true);

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
                        display: ${showIcons ? 'inline-flex' : 'none'};
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
                        color: ${colors.success};
                        border-left: 3px solid ${colors.success};
                        background: ${colors.success}11;
                    }
                    .error { 
                        color: ${colors.error};
                        border-left: 3px solid ${colors.error};
                        background: ${colors.error}11;
                    }
                    .warning { 
                        color: ${colors.warning};
                        border-left: 3px solid ${colors.warning};
                        background: ${colors.warning}11;
                    }
                    .info { 
                        color: ${colors.info};
                        border-left: 3px solid ${colors.info};
                        background: ${colors.info}11;
                    }
                    .system { 
                        color: ${colors.system};
                        border-left: 3px solid ${colors.system};
                        background: ${colors.system}11;
                    }
                    .temp-message {
                        background: var(--vscode-editor-selectionBackground);
                        border-left: 3px solid var(--vscode-focusBorder);
                        font-weight: 500;
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
                    const config = ${JSON.stringify({
                        autoScroll: config.get<boolean>('messages.autoScroll', true),
                        maxCount: config.get<number>('messages.maxCount', 1000)
                    })};
                    let autoScroll = config.autoScroll;
                    
                    // 初始化按钮状态
                    if (autoScroll) {
                        scrollLockButton.classList.add('active');
                    }
                    
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

                    function limitMessages() {
                        const messages = messageContainer.children;
                        if (messages.length > config.maxCount) {
                            const removeCount = messages.length - config.maxCount;
                            for (let i = 0; i < removeCount; i++) {
                                messages[0].remove();
                            }
                        }
                    }
                    
                    window.addEventListener('message', event => {
                        const message = event.data;
                        switch (message.type) {
                            case 'addMessage':
                                const div = document.createElement('div');
                                div.innerHTML = message.value;
                                messageContainer.appendChild(div);
                                limitMessages();
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
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const timeFormat = config.get<string>('messages.timeFormat', 'HH:mm:ss');
        const showIcons = config.get<boolean>('messages.showIcons', true);
        const maxCount = config.get<number>('messages.maxCount', 1000);

        // 限制消息数量
        if (this._messages.length >= maxCount) {
            this._messages = this._messages.slice(-maxCount + 1);
        }

        const now = new Date();
        let timestamp = '';
        
        switch (timeFormat) {
            case 'HH:mm':
                timestamp = now.toLocaleTimeString('zh-CN', { 
                    hour: '2-digit', 
                    minute: '2-digit'
                });
                break;
            case 'hh:mm:ss a':
                timestamp = now.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: true
                });
                break;
            case 'YYYY-MM-DD HH:mm:ss':
                timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${now.toLocaleTimeString('zh-CN')}`;
                break;
            default: // HH:mm:ss
                timestamp = now.toLocaleTimeString('zh-CN');
                break;
        }

        let type = 'info';
        let extraClass = '';

        if (message.includes('成功') || message.includes('完成')) {
            type = 'success';
        } else if (message.includes('错误') || message.includes('失败')) {
            type = 'error';
        } else if (message.includes('警告') || message.includes('注意')) {
            type = 'warning';
        } else if (message.includes('系统') || message.includes('初始化')) {
            type = 'system';
        }

        // 检查是否是临时消息(015协议)
        if (message.includes('更新中') || message.includes('维护中')) {
            extraClass = ' temp-message';
        }

        const formattedMessage = `<div class="message ${type}${extraClass}">
            <span class="timestamp">[${timestamp}]</span>
            ${showIcons ? `<span class="icon-container">💬</span>` : ''}
            <span class="message-content">${message}</span>
        </div>`;

        this._messages.push(formattedMessage);
        this._view?.webview.postMessage({ type: 'addMessage', value: formattedMessage });
    }

    public dispose() {
        // 清理资源
    }
} 
