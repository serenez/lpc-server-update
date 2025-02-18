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
    loginWithEmail: boolean;
    loginKey?: string;
}

export class MessageProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _messages: string[] = [];
    private readonly _extensionUri: vscode.Uri;

    constructor(uri: vscode.Uri) {
        this._extensionUri = uri;
    }

    private async handleEncodingChange(currentEncoding: string) {
        try {
            // 读取当前配置
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData) as Config;
            
            // 直接切换编码
            const newEncoding = currentEncoding === 'UTF8' ? 'GBK' : 'UTF8';
            config.encoding = newEncoding;
            
            // 保存配置
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            
            // 更新按钮文本
            this._view?.webview.postMessage({ 
                type: 'updateEncoding',
                encoding: newEncoding
            });

            // 显示成功消息
            this.addMessage(`编码设置已更改为: ${newEncoding}`);
            
            // 通知需要重新连接
            vscode.window.showInformationMessage('编码设置已更改,需要重新连接服务器以应用更改。');
        } catch (error) {
            vscode.window.showErrorMessage('更新编码设置失败: ' + error);
        }
    }

    private async handleLoginEmailChange(currentLoginWithEmail: boolean) {
        try {
            // 读取当前配置
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData) as Config;
            
            // 切换状态
            config.loginWithEmail = !currentLoginWithEmail;
            
            // 保存配置
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            
            // 更新按钮文本
            this._view?.webview.postMessage({ 
                type: 'updateLoginEmail',
                loginWithEmail: config.loginWithEmail
            });

            // 显示成功消息
            this.addMessage(`登录信息已更改为${config.loginWithEmail ? '包含' : '不包含'}邮箱`);
            
            // 通知需要重新连接
            vscode.window.showInformationMessage('登录设置已更改,需要重新连接服务器以应用更改。');
        } catch (error) {
            vscode.window.showErrorMessage('更新登录设置失败: ' + error);
        }
    }

    private async handleOpenSettings() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            if (!fs.existsSync(configPath)) {
                throw new Error('配置文件不存在');
            }

            const configUri = vscode.Uri.file(configPath);
            const document = await vscode.workspace.openTextDocument(configUri);
            const editor = await vscode.window.showTextDocument(document);

            // 查找 loginKey 的位置
            const text = document.getText();
            const loginKeyMatch = text.match(/"loginKey"\s*:\s*"[^"]*"/);
            
            if (loginKeyMatch) {
                const start = document.positionAt(loginKeyMatch.index!);
                const end = document.positionAt(loginKeyMatch.index! + loginKeyMatch[0].length);
                
                // 选中 loginKey 配置
                editor.selection = new vscode.Selection(start, end);
                
                // 滚动到选中位置
                editor.revealRange(new vscode.Range(start, end));
            }
            
            this.addMessage('已打开配置文件，loginKey 已选中');
        } catch (error) {
            vscode.window.showErrorMessage('打开配置文件失败: ' + error);
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

        // 读取当前配置
        let currentEncoding = 'UTF8';
        let loginWithEmail = false;
        let configLoadStatus = '未加载';
        
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (workspaceRoot) {
                const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
                if (fs.existsSync(configPath)) {
                    const configData = fs.readFileSync(configPath, 'utf8');
                    const config = JSON.parse(configData) as Config;
                    currentEncoding = config.encoding || 'UTF8';
                    loginWithEmail = config.loginWithEmail || false;
                    configLoadStatus = '已加载';
                    
                    // 移除重复的配置加载信息
                    if (configLoadStatus === '文件不存在') {
                        this.addMessage('配置文件不存在，将使用默认配置');
                    }
                } else {
                    configLoadStatus = '文件不存在';
                    this.addMessage('配置文件不存在，将使用默认配置');
                }
            } else {
                configLoadStatus = '工作区未找到';
                this.addMessage('未找到工作区，请打开有效的工作区');
            }
        } catch (error) {
            configLoadStatus = '加载失败';
            console.error('读取配置设置失败:', error);
            this.addMessage(`配置文件读取失败: ${error}`);
        }

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, currentEncoding, loginWithEmail, configLoadStatus);

        // 处理来自webview的消息
        webviewView.webview.onDidReceiveMessage(async message => {
            switch (message.command) {
                case 'clearMessages':
                    this._messages = [];
                    this._view?.webview.postMessage({ type: 'clearMessages' });
                    break;
                case 'changeEncoding':
                    this.handleEncodingChange(message.currentEncoding);
                    break;
                case 'changeLoginEmail':
                    this.handleLoginEmailChange(message.currentLoginWithEmail);
                    break;
                case 'openSettings':
                    this.handleOpenSettings();
                    break;
                case 'openFile':
                    try {
                        // 转换为本地文件路径
                        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                        if (!workspaceRoot) {
                            throw new Error('未找到工作区');
                        }
                        
                        // 移除开头的斜杠并组合完整路径
                        const localPath = vscode.Uri.file(
                            path.join(workspaceRoot, message.file.replace(/^\//, ''))
                        );
                        
                        // 打开文件并跳转到指定行
                        const document = await vscode.workspace.openTextDocument(localPath);
                        const editor = await vscode.window.showTextDocument(document);
                        
                        // 跳转到错误行并选中
                        const line = message.line - 1; // VSCode 行号从0开始
                        const range = new vscode.Range(line, 0, line, 1000);
                        editor.selection = new vscode.Selection(range.start, range.end);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    } catch (error) {
                        this.addMessage(`❌ 打开文件失败: ${error}`);
                    }
                    break;
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview, currentEncoding: string, loginWithEmail: boolean, configLoadStatus: string) {
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
                        overflow: hidden;
                    }
                    #message-container {
                        display: flex;
                        flex-direction: column;
                        height: 100%;
                        overflow-y: auto;
                        padding-top: 50px;
                        padding-bottom: 10px;
                        gap: 6px;
                        box-sizing: border-box;
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
                        top: 10px;
                        right: 10px;
                        display: flex;
                        gap: 6px;
                        z-index: 1000;
                        background: var(--vscode-editor-background);
                        padding: 4px;
                        border-radius: 4px;
                    }
                    .config-button {
                        padding: 2px 6px;
                        background: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                        border: none;
                        border-radius: 3px;
                        cursor: pointer;
                        font-size: 11px;
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        opacity: 0.9;
                        transition: all 0.2s ease;
                        white-space: nowrap;
                        min-width: fit-content;
                        font-family: var(--vscode-font-family);
                        line-height: 16px;
                        height: 20px;
                    }
                    .config-button:hover {
                        opacity: 1;
                    }
                    .config-button.utf8 {
                        background: rgba(33, 150, 243, 0.2);
                        color: #2196F3;
                    }
                    .config-button.utf8:hover {
                        background: rgba(33, 150, 243, 0.3);
                    }
                    .config-button.gbk {
                        background: rgba(156, 39, 176, 0.2);
                        color: #9C27B0;
                    }
                    .config-button.gbk:hover {
                        background: rgba(156, 39, 176, 0.3);
                    }
                    .config-button.with-email {
                        background: rgba(76, 175, 80, 0.2);
                        color: #4CAF50;
                    }
                    .config-button.with-email:hover {
                        background: rgba(76, 175, 80, 0.3);
                    }
                    .config-button.without-email {
                        background: rgba(255, 152, 0, 0.2);
                        color: #FF9800;
                    }
                    .config-button.without-email:hover {
                        background: rgba(255, 152, 0, 0.3);
                    }
                    .icon-button {
                        padding: 2px;
                        width: 20px;
                        height: 20px;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        font-size: 14px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        opacity: 0.7;
                        transition: all 0.2s ease;
                        color: var(--vscode-foreground);
                        border-radius: 3px;
                    }
                    .icon-button:hover {
                        opacity: 1;
                        background: var(--vscode-button-secondaryBackground);
                    }
                    .icon-button.delete {
                        color: var(--vscode-errorForeground);
                    }
                    .icon-button.delete:hover {
                        background: rgba(255,0,0,0.1);
                    }
                    .icon-button.active {
                        opacity: 1;
                        color: #2196F3;
                        background: rgba(33,150,243,0.1);
                    }
                    .icon-button.settings {
                        color: #64B5F6;
                    }
                    .icon-button.settings:hover {
                        background: rgba(100, 181, 246, 0.2);
                    }
                    .error-link {
                        cursor: pointer;
                        background: none;
                        border: none;
                        padding: 4px 8px;
                        margin: 0;
                        font: inherit;
                        color: inherit;
                        text-align: left;
                        display: block;
                        width: 100%;
                        border-radius: 3px;
                        transition: all 0.2s ease;
                    }
                    
                    .error-link:hover {
                        background: rgba(255, 0, 0, 0.1);
                    }
                    
                    .error-file, .error-line, .error-message {
                        display: block;
                        padding: 2px 0;
                    }
                    
                    .error-file {
                        color: #40a9ff;
                    }
                    
                    .error-line {
                        color: #ff7875;
                    }
                    
                    .error-message {
                        color: #ff4d4f;
                    }
                </style>
            </head>
            <body>
                <div id="message-container">
                    ${this._messages.join('\n')}
                </div>
                <div class="button-container">
                    <button class="config-button settings" id="settingsButton" title="设置登录KEY">
                        登录KEY
                    </button>
                    <button class="config-button" id="encodingButton" title="当前编码">
                        ${currentEncoding}
                    </button>
                    <button class="config-button" id="loginEmailButton" title="登录邮箱状态">
                        登录:${loginWithEmail ? '含邮箱' : '不含'}
                    </button>
                    <button class="icon-button" id="scrollLockButton" title="自动滚动">
                        🔒
                    </button>
                    <button class="icon-button delete" id="clearButton" title="清除消息">
                        ❌
                    </button>
                </div>
                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        const messageContainer = document.getElementById('message-container');
                        const encodingButton = document.getElementById('encodingButton');
                        const loginEmailButton = document.getElementById('loginEmailButton');
                        const scrollLockButton = document.getElementById('scrollLockButton');
                        const clearButton = document.getElementById('clearButton');
                        const settingsButton = document.getElementById('settingsButton');
                        
                        const config = {
                            autoScroll: ${config.get<boolean>('messages.autoScroll', true)},
                            maxCount: ${config.get<number>('messages.maxCount', 1000)},
                            encoding: "${currentEncoding}",
                            loginWithEmail: ${loginWithEmail}
                        };
                        
                        let autoScroll = config.autoScroll;
                        
                        function updateButtons() {
                            if (encodingButton) {
                                encodingButton.textContent = config.encoding;
                                encodingButton.className = 'config-button ' + 
                                    (config.encoding === 'UTF8' ? 'utf8' : 'gbk');
                            }
                            if (loginEmailButton) {
                                loginEmailButton.textContent = "登录:" + (config.loginWithEmail ? '含邮箱' : '不含邮箱');
                                loginEmailButton.className = 'config-button ' + 
                                    (config.loginWithEmail ? 'with-email' : 'without-email');
                            }
                            if (scrollLockButton) {
                                scrollLockButton.textContent = autoScroll ? '🔒' : '🔓';
                                scrollLockButton.classList.toggle('active', autoScroll);
                            }
                        }
                        
                        // 绑定按钮事件
                        encodingButton.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'changeEncoding',
                                currentEncoding: config.encoding
                            });
                        });
                        
                        loginEmailButton.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'changeLoginEmail',
                                currentLoginWithEmail: config.loginWithEmail
                            });
                        });
                        
                        scrollLockButton.addEventListener('click', () => {
                            autoScroll = !autoScroll;
                            updateButtons();
                            if (autoScroll) {
                                scrollToBottom();
                            }
                        });
                        
                        clearButton.addEventListener('click', clearMessages);
                        
                        settingsButton?.addEventListener('click', () => {
                            vscode.postMessage({
                                command: 'openSettings'
                            });
                        });
                        
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

                        // 监听状态更新
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'updateEncoding':
                                    config.encoding = message.encoding;
                                    updateButtons();
                                    break;
                                case 'updateLoginEmail':
                                    config.loginWithEmail = message.loginWithEmail;
                                    updateButtons();
                                    break;
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

                        // 修改错误消息点击事件
                        messageContainer.addEventListener('click', (e) => {
                            const errorLink = e.target.closest('.error-link');
                            if (errorLink) {
                                e.preventDefault();
                                const filePath = errorLink.dataset.file;
                                const line = parseInt(errorLink.dataset.line);
                                
                                console.log('Clicked error link:', { filePath, line });
                                
                                vscode.postMessage({
                                    command: 'openFile',
                                    file: filePath,
                                    line: line
                                });
                            }
                        });

                        // 初始化按钮状态
                        updateButtons();
                    })();
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

        // 检查是否是编译错误消息
        const errorMatch = message.match(/❌ 编译错误:\s*文件:\s*([^\n]+)\s*行号:\s*(\d+)\s*错误:\s*(.*)/);
        if (errorMatch) {
            const [, filePath, line, errorMessage] = errorMatch;
            // 添加可点击的链接样式，使用 button 而不是 span
            const messageHtml = `<div class="message error${extraClass}">
                <span class="timestamp">[${timestamp}]</span>
                ${showIcons ? `<span class="icon-container">❌</span>` : ''}
                <button class="error-link" data-file="${filePath}" data-line="${line}">
                    编译错误: 
                    <span class="error-file">文件: ${filePath}</span>
                    <span class="error-line">行号: ${line}</span>
                    <span class="error-message">错误: ${errorMessage}</span>
                </button>
            </div>`;
            
            this._messages.push(messageHtml);
            this._view?.webview.postMessage({ 
                type: 'addMessage', 
                value: messageHtml,
                isError: true,
                errorData: { filePath, line: parseInt(line), message: errorMessage }
            });
        } else {
            const messageHtml = `<div class="message ${type}${extraClass}">
                <span class="timestamp">[${timestamp}]</span>
                ${showIcons && !hasEmoji ? `<span class="icon-container">💬</span>` : ''}
                <span class="message-content">${formattedMessage}</span>
            </div>`;

            this._messages.push(messageHtml);
            this._view?.webview.postMessage({ type: 'addMessage', value: messageHtml });
        }
    }

    public dispose() {
        // 清理资源
    }
} 
