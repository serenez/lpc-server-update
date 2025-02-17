import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Config {
    rootPath: string;
    serverKey: string;
    encoding: string;
    compile: {
        autoCompileOnSave: boolean;
        defaultDir: string;
        timeout: number;
        showDetails: boolean;
    };
}

export class MessageProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: string[] = [];
    private readonly _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    private async handleEncodingChange(currentEncoding: string) {
        try {
            // 读取当前编码设置
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData) as Config;
            
            // 获取实际的当前编码
            const actualEncoding = config.encoding || 'UTF8';
            
            // 构建编码选项
            const encodings = ['UTF8', 'GBK'];
            const items = encodings.map(enc => ({
                label: enc,
                description: enc === actualEncoding ? '当前编码' : '',
                picked: enc === actualEncoding
            }));

            // 显示选择框
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择编码',
                title: '更改编码设置'
            });

            if (selected) {
                // 更新配置文件
                config.encoding = selected.label;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                
                // 更新按钮文本
                this._view?.webview.postMessage({ 
                    type: 'updateEncoding',
                    encoding: selected.label
                });

                // 显示成功消息
                this.addMessage(`编码设置已更改为: ${selected.label}`);
                
                // 通知需要重新连接
                vscode.window.showInformationMessage('编码设置已更改,需要重新连接服务器以应用更改。');
            }
        } catch (error) {
            vscode.window.showErrorMessage('更新编码设置失败: ' + error);
        }
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

        // 读取当前编码设置
        let currentEncoding = 'UTF8';
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (workspaceRoot) {
                const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
                if (fs.existsSync(configPath)) {
                    const configData = fs.readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configData) as Config;
                    currentEncoding = config.encoding || 'UTF8';
                }
            }
        } catch (error) {
            console.error('读取编码设置失败:', error);
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, currentEncoding);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'clearMessages':
                    this._messages = [];
                    this._view?.webview.postMessage({ type: 'clearMessages' });
                    break;
                case 'changeEncoding':
                    this.handleEncodingChange(message.currentEncoding);
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, currentEncoding: string) {
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
                        font-size: 13px;
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
                        gap: 6px;
                    }
                    #message-container::-webkit-scrollbar {
                        width: 6px;
                    }
                    #message-container::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    #message-container::-webkit-scrollbar-thumb {
                        background: var(--vscode-scrollbarSlider-background);
                        border-radius: 3px;
                    }
                    #message-container::-webkit-scrollbar-thumb:hover {
                        background: var(--vscode-scrollbarSlider-hoverBackground);
                    }
                    .message {
                        margin: 0;
                        padding: 6px 10px;
                        border-radius: 4px;
                        word-break: break-all;
                        line-height: 1.4;
                        display: flex;
                        align-items: flex-start;
                        gap: 6px;
                        transition: all 0.2s ease;
                        border: 1px solid transparent;
                        background: var(--vscode-editor-background);
                        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                        font-size: 13px;
                    }
                    .message.has-code {
                        display: block;
                    }
                    .message.has-code .timestamp,
                    .message.has-code .icon-container {
                        display: inline-block;
                        vertical-align: top;
                        margin-bottom: 6px;
                    }
                    .message:hover {
                        background: var(--vscode-editor-background);
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    }
                    .success:hover { 
                        color: #4dc352;
                        border-color: #4dc352;
                        background: rgba(46, 160, 67, 0.12);
                    }
                    .error:hover { 
                        color: #ff5a52;
                        border-color: #ff5a52;
                        background: rgba(255, 90, 82, 0.12);
                    }
                    .warning:hover { 
                        color: #e8a317;
                        border-color: #e8a317;
                        background: rgba(232, 163, 23, 0.12);
                    }
                    .info:hover { 
                        color: #69b5ff;
                        border-color: #69b5ff;
                        background: rgba(105, 181, 255, 0.12);
                    }
                    .system:hover { 
                        color: #c89fff;
                        border-color: #c89fff;
                        background: rgba(200, 159, 255, 0.12);
                    }
                    .temp-message:hover {
                        background: rgba(88, 166, 255, 0.1);
                        border-color: #58a6ff;
                    }
                    .timestamp {
                        color: var(--vscode-descriptionForeground);
                        font-size: 12px;
                        font-family: var(--vscode-editor-font-family);
                        padding: 1px 4px;
                        border-radius: 2px;
                        background: var(--vscode-editor-lineHighlightBackground);
                        white-space: nowrap;
                        opacity: 0.9;
                    }
                    .message:hover .timestamp {
                        opacity: 1;
                    }
                    .icon-container {
                        display: ${showIcons ? 'inline-flex' : 'none'};
                        align-items: center;
                        justify-content: center;
                        width: 16px;
                        height: 16px;
                        font-size: 14px;
                        opacity: 0.9;
                    }
                    .message:hover .icon-container {
                        opacity: 1;
                    }
                    .message-content {
                        flex: 1;
                        line-height: 1.5;
                    }
                    .code-block {
                        margin: 6px 0 0 0;
                        padding: 8px 10px;
                        background: var(--vscode-textCodeBlock-background);
                        border-radius: 3px;
                        font-family: var(--vscode-editor-font-family);
                        font-size: 12px;
                        line-height: 1.4;
                        overflow-x: auto;
                        white-space: pre;
                    }
                    .message:hover .code-block {
                        background: var(--vscode-textCodeBlock-background);
                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                    }
                    .code-block code {
                        color: var(--vscode-textPreformat-foreground);
                    }
                    .success { 
                        color: #4dc352;
                        border-left: 2px solid #4dc352;
                        background: rgba(46, 160, 67, 0.08);
                    }
                    .error { 
                        color: #ff5a52;
                        border-left: 2px solid #ff5a52;
                        background: rgba(255, 90, 82, 0.08);
                    }
                    .warning { 
                        color: #e8a317;
                        border-left: 2px solid #e8a317;
                        background: rgba(232, 163, 23, 0.08);
                    }
                    .info { 
                        color: #69b5ff;
                        border-left: 2px solid #69b5ff;
                        background: rgba(105, 181, 255, 0.08);
                    }
                    .system { 
                        color: #c89fff;
                        border-left: 2px solid #c89fff;
                        background: rgba(200, 159, 255, 0.08);
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
                    .encoding-button {
                        position: fixed;
                        top: 10px;
                        right: 10px;
                        padding: 4px 8px;
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        opacity: 0.8;
                        transition: all 0.2s ease;
                        z-index: 1000;
                    }
                    .encoding-button:hover {
                        opacity: 1;
                        background: var(--vscode-button-secondaryHoverBackground);
                    }
                </style>
            </head>
            <body>
                <button class="encoding-button" onclick="changeEncoding()">
                    <span class="icon">🔤</span>
                    <span>编码: ${currentEncoding}</span>
                </button>
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
                    const config = ${JSON.stringify({
                        autoScroll: config.get<boolean>('messages.autoScroll', true),
                        maxCount: config.get<number>('messages.maxCount', 1000),
                        encoding: currentEncoding
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
                    
                    function changeEncoding() {
                        vscode.postMessage({
                            command: 'changeEncoding',
                            currentEncoding: config.encoding
                        });
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
                            case 'updateEncoding':
                                const encodingButton = document.querySelector('.encoding-button span:last-child');
                                if (encodingButton) {
                                    encodingButton.textContent = '编码: ' + message.encoding;
                                }
                                break;
                        }
                    });

                    // 初始化
                    updateButtons();
                </script>
            </body>
            </html>`;
    }

    private formatTSValue(value: any): string {
        if (typeof value === 'string') {
            return `"${value}"`;
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
            return value.toString();
        }
        if (value === null) {
            return 'null';
        }
        if (Array.isArray(value)) {
            const items = value.map(item => this.formatTSValue(item)).join(',\n');
            return `[\n${this.indent(items)}\n]`;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value).map(([key, val]) => 
                `"${key}": ${this.formatTSValue(val)}`
            ).join(',\n');
            return `{\n${this.indent(entries)}\n}`;
        }
        return String(value);
    }

    private indent(text: string): string {
        return text.split('\n').map(line => `  ${line}`).join('\n');
    }

    private wrapInCodeBlock(code: string, language: string = 'typescript'): string {
        return `<pre class="code-block ${language}"><code>${this.escapeHtml(code)}</code></pre>`;
    }

    private escapeHtml(text: string): string {
        const map: {[key: string]: string} = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
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
        let formattedMessage = message;

        // 检查消息是否已经包含emoji图标或特殊Unicode字符
        const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{2300}-\u{23FF}]|[\u{2B00}-\u{2BFF}]|[\u{E000}-\u{F8FF}]/u.test(message);

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

        // 检查是否包含JSON或TS对象
        if (message.includes('Eval结果:')) {
            try {
                const jsonStart = message.indexOf('\n') + 1;
                const jsonStr = message.substring(jsonStart);
                const jsonObj = JSON.parse(jsonStr);
                const formattedJson = this.formatTSValue(jsonObj);
                formattedMessage = `${message.substring(0, jsonStart)}${this.wrapInCodeBlock(formattedJson)}`;
                extraClass += ' has-code';
            } catch (e) {
                // 如果解析失败,保持原始消息
                console.error('JSON解析失败:', e);
            }
        }

        const messageHtml = `<div class="message ${type}${extraClass}">
            <span class="timestamp">[${timestamp}]</span>
            ${showIcons && !hasEmoji ? `<span class="icon-container">💬</span>` : ''}
            <span class="message-content">${formattedMessage}</span>
        </div>`;

        this._messages.push(messageHtml);
        this._view?.webview.postMessage({ type: 'addMessage', value: messageHtml });
    }

    public dispose() {
        // 清理资源
    }
} 
