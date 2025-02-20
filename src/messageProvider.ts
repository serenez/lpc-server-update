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

        const style = `
            body {
                padding: 0;
                margin: 0;
                height: 100vh;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            /* 按钮容器 */
            .button-container {
                position: sticky;
                top: 0;
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 1000;
                background: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
                padding: 8px 12px;
                padding-right: 92px;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
                backdrop-filter: blur(20px);
                order: -1;
                min-height: 36px;
                flex-wrap: nowrap;
                border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 50%, transparent);
                width: 100%;
                box-sizing: border-box;
            }

            /* 消息容器 */
            #message-container {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
                margin-top: 0;
                display: flex;
                flex-direction: column;
                gap: 4px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                padding-bottom: 10px;
                position: relative;
            }

            /* 悬浮按钮容器 */
            .floating-buttons {
                position: fixed;
                top: 14px;
                right: 14px;
                display: flex;
                gap: 6px;
                z-index: 1001;
            }

            /* 消息样式基础 */
            .message {
                position: relative;
                padding: 8px 12px;
                border-radius: 8px;
                max-width: 85%;
                font-size: 12px;
                line-height: 1.4;
                word-break: break-word;
                margin: 2px 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe WPC', 'Segoe UI', 'Microsoft YaHei', sans-serif;
                backdrop-filter: blur(10px);
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                letter-spacing: 0.3px;
            }

            /* 服务器消息靠左 */
            .message.server-message {
                align-self: flex-start;
                margin-right: auto;
                border-left: 3px solid rgba(28, 126, 214, 0.95);
                border-bottom-left-radius: 4px;
                background: rgba(28, 126, 214, 0.1);
                animation: slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.05);
            }

            /* 插件消息靠右 */
            .message.plugin-message {
                align-self: flex-end;
                margin-left: auto;
                border-right: 3px solid rgba(236, 72, 153, 0.95);
                border-bottom-right-radius: 4px;
                background: rgba(236, 72, 153, 0.2);
                animation: slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: inset -1px 1px 0 rgba(255, 255, 255, 0.1);
            }

            /* 错误消息样式 */
            .message.error {
                border-right: 2px solid #ff453a;
                background: color-mix(in srgb, var(--vscode-editor-background) 65%, #ff453a);
            }

            .error-details {
                background: rgba(255, 69, 58, 0.1);
                border-radius: 6px;
                padding: 6px 10px;
                margin-top: 4px;
                box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
            }

            .error-title {
                color: #ff453a;
                font-weight: 500;
                font-size: 11px;
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                letter-spacing: 0.2px;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
            }

            .error-file {
                color: var(--vscode-textLink-foreground);
                margin: 4px 0;
                padding: 3px 6px;
                background: rgba(96, 165, 250, 0.1);
                border-radius: 4px;
                font-family: var(--vscode-editor-font-family);
                font-size: 11px;
                letter-spacing: 0.2px;
            }

            .error-line {
                color: #ff453a;
                margin: 4px 0;
                font-weight: 500;
                font-size: 11px;
                letter-spacing: 0.2px;
                text-shadow: 0 1px 1px rgba(0, 0, 0, 0.2);
            }

            .error-message {
                margin: 4px 0;
                padding: 3px 6px;
                background: rgba(255, 69, 58, 0.1);
                border-radius: 4px;
                font-family: var(--vscode-editor-font-family);
                font-size: 11px;
                letter-spacing: 0.2px;
                line-height: 1.4;
            }

            /* 消息类型样式 - 插件消息 */
            .message.plugin-message.success { 
                border-right: 3px solid rgba(34, 211, 238, 0.95);
                background: rgba(34, 211, 238, 0.2);
            }

            .message.plugin-message.warning { 
                border-right: 3px solid rgba(251, 146, 60, 0.95);
                background: rgba(251, 146, 60, 0.2);
            }

            .message.plugin-message.info { 
                border-right: 3px solid rgba(236, 72, 153, 0.95);
                background: rgba(236, 72, 153, 0.2);
            }

            .message.plugin-message.system { 
                border-right: 3px solid rgba(167, 139, 250, 0.95);
                background: rgba(167, 139, 250, 0.2);
            }

            .message.plugin-message.eval-message {
                border-right: 3px solid rgba(234, 179, 8, 0.95);
                background: rgba(234, 179, 8, 0.2);
            }

            .message.plugin-message.error {
                border-right: 3px solid rgba(239, 68, 68, 0.95);
                background: rgba(239, 68, 68, 0.2);
            }

            /* 服务器消息类型样式 */
            .message.server-message.success {
                border-left: 3px solid rgba(34, 197, 94, 0.95);
                background: rgba(34, 197, 94, 0.1);
            }

            .message.server-message.warning {
                border-left: 3px solid rgba(245, 158, 11, 0.95);
                background: rgba(245, 158, 11, 0.1);
            }

            .message.server-message.info {
                border-left: 3px solid rgba(28, 126, 214, 0.95);
                background: rgba(28, 126, 214, 0.1);
            }

            .message.server-message.system {
                border-left: 3px solid rgba(147, 51, 234, 0.95);
                background: rgba(147, 51, 234, 0.1);
            }

            .message.server-message.eval-message {
                border-left: 3px solid rgba(249, 115, 22, 0.95);
                background: rgba(249, 115, 22, 0.1);
            }

            .message.server-message.error {
                border-left: 3px solid rgba(220, 38, 38, 0.95);
                background: rgba(220, 38, 38, 0.1);
            }

            /* 时间戳样式 */
            .timestamp {
                color: var(--vscode-descriptionForeground);
                font-family: var(--vscode-editor-font-family);
                padding: 2px 6px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 3px;
                white-space: nowrap;
                font-size: 10px;
                letter-spacing: 0.3px;
                opacity: 0.8;
                margin-bottom: 4px;
                display: inline-block;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            }

            /* 消息内容基础样式 */
            .message-content {
                line-height: 1.4;
                color: var(--vscode-editor-foreground) !important;
                font-weight: 400;
                letter-spacing: 0.2px;
                font-size: 12px;
            }

            /* 操作提示消息样式 */
            .message-content .operation {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 8px;
                border-radius: 6px;
                background: rgba(255, 255, 255, 0.05);
                margin: 2px 0;
                font-weight: 500;
                letter-spacing: 0.3px;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            }

            .operation.compile { color: #60a5fa; }     /* 编译操作 - 蓝色 */
            .operation.connect { color: #34d399; }     /* 连接操作 - 绿色 */
            .operation.disconnect { color: #f87171; }  /* 断开操作 - 红色 */
            .operation.login { color: #818cf8; }       /* 登录操作 - 紫色 */
            .operation.config { color: #fbbf24; }      /* 配置操作 - 黄色 */
            .operation.eval { color: #f472b6; }        /* Eval操作 - 粉色 */

            /* 代码块样式优化 */
            .message .message-content .code-block {
                background: rgba(30, 30, 30, 0.6);
                border-radius: 8px;
                padding: 8px 10px;
                margin: 6px 0;
                font-family: 'Fira Code', Consolas, 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.2 !important;
                overflow-x: auto;
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                letter-spacing: 0.2px !important;
                white-space: pre;
            }

            .message .message-content .code-block code {
                white-space: pre;
                font-family: inherit;
                color: #e5e7eb;
                text-shadow: none;
                line-height: 1.2 !important;
            }

            /* 代码高亮优化 */
            .message .message-content .code-block .string { color: #fca5a5 !important; }    /* 字符串 - 浅红色 */
            .message .message-content .code-block .number { color: #93c5fd !important; }    /* 数字 - 浅蓝色 */
            .message .message-content .code-block .boolean { color: #93c5fd !important; }   /* 布尔值 - 浅蓝色 */
            .message .message-content .code-block .null { color: #93c5fd !important; }      /* null - 浅蓝色 */
            .message .message-content .code-block .key { color: #c4b5fd !important; }       /* 键名 - 紫色 */
            .message .message-content .code-block .punctuation { color: #9ca3af !important; } /* 标点符号 - 灰色 */

            /* 代码块行样式 */
            .message .message-content .code-block .line {
                display: block;
                min-height: 1.2em !important;
                padding: 0 2px;
                margin: 0 -2px;
                border-radius: 3px;
                line-height: 1.2 !important;
            }

            .message .message-content .code-block .line:hover {
                background: rgba(255, 255, 255, 0.05);
            }

            /* 代码块滚动条 */
            .message .message-content .code-block::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }

            .message .message-content .code-block::-webkit-scrollbar-track {
                background: transparent;
            }

            .message .message-content .code-block::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }

            .message .message-content .code-block::-webkit-scrollbar-thumb:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            /* 配置按钮 */
            .config-button {
                height: 26px;
                padding: 0 12px;
                font-size: 11px;
                border-radius: 6px;
                border: 1px solid color-mix(in srgb, var(--vscode-button-border) 30%, transparent);
                background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 95%, transparent);
                color: var(--vscode-button-secondaryForeground);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                min-width: 0;
                flex: 1;
                backdrop-filter: blur(10px);
                font-weight: 450;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
                letter-spacing: 0.3px;
            }

            .config-button:hover {
                background: color-mix(in srgb, var(--vscode-button-secondaryHoverBackground) 95%, transparent);
                transform: translateY(-1px);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2),
                            0 4px 8px rgba(0, 0, 0, 0.1);
            }

            .config-button:active {
                transform: translateY(0);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
            }

            .config-button.settings {
                background: color-mix(in srgb, #007AFF 95%, transparent);
                color: #ffffff;
            }

            .config-button.settings:hover {
                background: color-mix(in srgb, #0A84FF 95%, transparent);
            }

            .config-button.utf8 {
                background: color-mix(in srgb, #34C759 95%, transparent);
                color: #ffffff;
            }

            .config-button.utf8:hover {
                background: color-mix(in srgb, #30D158 95%, transparent);
            }

            .config-button.gbk {
                background: color-mix(in srgb, #FF9500 95%, transparent);
                color: #ffffff;
            }

            .config-button.gbk:hover {
                background: color-mix(in srgb, #FFB340 95%, transparent);
            }

            .config-button.with-email {
                background: color-mix(in srgb, #5856D6 95%, transparent);
                color: #ffffff;
            }

            .config-button.with-email:hover {
                background: color-mix(in srgb, #6C6ADA 95%, transparent);
            }

            .config-button.without-email {
                background: color-mix(in srgb, #AF52DE 95%, transparent);
                color: #ffffff;
            }

            .config-button.without-email:hover {
                background: color-mix(in srgb, #BF5AF2 95%, transparent);
            }

            /* 图标按钮 */
            .icon-button {
                width: 22px;
                height: 22px;
                min-width: 22px;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--vscode-button-border) 30%, transparent);
                border-radius: 6px;
                background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 95%, transparent);
                color: var(--vscode-foreground);
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                flex-shrink: 0;
                font-size: 13px;
                backdrop-filter: blur(10px);
            }

            .icon-button:hover {
                background: color-mix(in srgb, var(--vscode-button-secondaryHoverBackground) 95%, transparent);
                transform: translateY(-1px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            }

            .icon-button:active {
                transform: translateY(0);
                box-shadow: none;
            }

            .icon-button.delete {
                color: var(--vscode-errorForeground);
            }

            .icon-button.delete:hover {
                background: color-mix(in srgb, var(--vscode-errorForeground) 10%, var(--vscode-button-secondaryBackground));
            }

            .icon-button.lock {
                color: var(--vscode-foreground);
            }

            .icon-button.lock.active {
                color: #60a5fa;
                background: color-mix(in srgb, #60a5fa 10%, var(--vscode-button-secondaryBackground));
            }

            /* 滚动条样式 */
            #message-container::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }

            #message-container::-webkit-scrollbar-track {
                background: transparent;
            }

            #message-container::-webkit-scrollbar-thumb {
                background: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 80%, transparent);
                border-radius: 4px;
                border: 2px solid transparent;
                background-clip: padding-box;
            }

            #message-container::-webkit-scrollbar-thumb:hover {
                background: color-mix(in srgb, var(--vscode-scrollbarSlider-hoverBackground) 80%, transparent);
                border: 1.5px solid transparent;
            }

            /* 平滑滚动 */
            * {
                scroll-behavior: smooth;
            }
        `;

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    ${style}
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
                    <button class="config-button ${currentEncoding === 'UTF8' ? 'utf8' : 'gbk'}" id="encodingButton" title="当前编码">
                        ${currentEncoding}
                    </button>
                    <button class="config-button ${loginWithEmail ? 'with-email' : 'without-email'}" id="loginEmailButton" title="登录邮箱状态">
                        登录:${loginWithEmail ? '含邮箱' : '不含'}
                    </button>
                </div>
                <div class="floating-buttons">
                    <button class="icon-button lock active" id="scrollLockButton" title="自动滚动已开启">
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

    private indent(text: string): string {
        return text.split('\n').map(line => `  ${line}`).join('\n');  // 使用2个空格缩进
    }

    private splitArrayElements(content: string): string[] {
        const elements: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '(' || char === '[' || char === '{') {
                    depth++;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                }
            }
            
            if (char === ',' && depth === 0 && !inString) {
                elements.push(current.trim());
                current = '';
                continue;
            }
            
            current += char;
        }
        
        if (current.trim()) {
            elements.push(current.trim());
        }
        
        return elements;
    }

    private splitPairs(content: string): string[] {
        const pairs: string[] = [];
        let current = '';
        let depth = 0;
        let inString = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '(' || char === '[' || char === '{') {
                    depth++;
                } else if (char === ')' || char === ']' || char === '}') {
                    depth--;
                }
            }
            
            if (char === ',' && depth === 0 && !inString) {
                pairs.push(current.trim());
                current = '';
                continue;
            }
            
            current += char;
        }
        
        if (current.trim()) {
            pairs.push(current.trim());
        }
        
        return pairs;
    }

    private splitKeyValue(pair: string): [string | null, string | null] {
        const colonIndex = pair.indexOf(':');
        if (colonIndex === -1) {
            return [null, null];
        }
        
        const key = pair.substring(0, colonIndex).trim();
        const value = pair.substring(colonIndex + 1).trim();
        
        return [key, value];
    }

    private parseBasicValue(value: string): any {
        value = value.trim();
        
        // 移除注释
        value = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        
        // 数字
        if (/^-?\d+$/.test(value)) {
            return parseInt(value);
        }
        
        // 浮点数
        if (/^-?\d*\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        
        // 字符串
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        // 布尔值
        if (value === '1') return true;
        if (value === '0') return false;
        
        return value;
    }

    private parseLPCMapping(content: string): any {
        if (!content.trim()) {
            return content;
        }

        try {
            // 清理输入字符串
            content = content.replace(/^"+|"+$/g, ''); // 移除外层引号
            content = content.replace(/\\r/g, ''); // 移除 \r
            content = content.replace(/\\\"/g, '"'); // 处理转义的引号

            // 处理LPC数组格式 ({ item1, item2 })
            if (content.trim().startsWith('({') && content.trim().endsWith('})')) {
                // 提取数组内容
                let arrayContent = content.substring(content.indexOf('({') + 2, content.lastIndexOf('})'));
                
                // 移除注释
                arrayContent = arrayContent.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                
                // 如果是空数组
                if (!arrayContent) {
                    return '({})';
                }
                
                // 分割数组元素
                const elements = this.splitArrayElements(arrayContent);
                
                // 格式化每个元素
                const formattedElements = elements.map(element => {
                    element = element.trim();
                    // 检查是否是对象引用格式 path#id ("name")
                    const match = element.match(/([^#]+)#(\d+)\s*\("([^"]+)"\)/);
                    if (match) {
                        const [, path, id, name] = match;
                        return {
                            path: path.trim(),
                            id: parseInt(id),
                            name: name
                        };
                    }
                    return element;
                });

                // 返回格式化后的结果
                return formattedElements;
            }

            // 处理其他LPC映射格式
            if (content.trim().startsWith('([') && content.trim().endsWith('])')) {
                content = content.substring(content.indexOf('([') + 2, content.lastIndexOf('])'));
                
                content = content.replace(/\/\*[\s\S]*?\*\//g, '');
                
                const pairs = this.splitPairs(content);
                
                const result: any = {};
                
                pairs.forEach(pair => {
                    pair = pair.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                    
                    const [key, value] = this.splitKeyValue(pair);
                    if (!key || !value) {
                        return;
                    }
                    
                    const cleanKey = key.replace(/"/g, '').trim();
                    
                    let cleanValue = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                    
                    if (cleanValue.startsWith('([') && cleanValue.endsWith('])')) {
                        result[cleanKey] = this.parseLPCMapping(cleanValue);
                    } else if (cleanValue.startsWith('({') && cleanValue.endsWith('})')) {
                        result[cleanKey] = this.parseLPCArray(cleanValue);
                    } else {
                        result[cleanKey] = this.parseBasicValue(cleanValue);
                    }
                });
                
                return result;
            }

            return content;
        } catch (error) {
            console.error('解析LPC映射出错:', error);
            return content;
        }
    }

    private parseLPCArray(content: string): any[] {
        if (!content.trim()) {
            return [];
        }

        try {
            // 提取数组内容
            let arrayContent = content.substring(content.indexOf('({') + 2, content.lastIndexOf('})'));
            
            // 移除注释
            arrayContent = arrayContent.replace(/\/\*[\s\S]*?\*\//g, '').trim();
            
            // 如果是空数组
            if (!arrayContent) {
                return [];
            }
            
            // 分割数组元素
            const elements = this.splitArrayElements(arrayContent);
            
            // 格式化每个元素
            return elements.map(element => {
                element = element.trim();
                // 检查是否是对象引用格式 path#id ("name")
                const match = element.match(/([^#]+)#(\d+)\s*\("([^"]+)"\)/);
                if (match) {
                    const [, path, id, name] = match;
                    return {
                        path: path.trim(),
                        id: parseInt(id),
                        name: name
                    };
                }
                return this.parseBasicValue(element);
            });
        } catch (error) {
            console.error('解析LPC数组出错:', error);
            return [];
        }
    }

    private formatTSValue(value: any, indent: number = 0): string {
        const indentStr = '  '.repeat(indent);
        
        if (typeof value === 'string') {
            return `<span class="string">"${value}"</span>`;
        }
        if (typeof value === 'number') {
            return `<span class="number">${value}</span>`;
        }
        if (typeof value === 'boolean') {
            return `<span class="boolean">${value}</span>`;
        }
        if (value === null) {
            return `<span class="null">null</span>`;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return '<span class="punctuation">({})</span>';
            
            // 检查是否是对象引用数组
            if (value[0] && typeof value[0] === 'object' && 'path' in value[0]) {
                const items = value.map(item => 
                    `${indentStr}  ${item.path}<span class="punctuation">#</span><span class="number">${item.id}</span> <span class="punctuation">(</span><span class="string">"${item.name}"</span><span class="punctuation">)</span>`
                ).join('<span class="punctuation">,</span>\n');
                return `<span class="punctuation">({</span>\n${items}\n${indentStr}<span class="punctuation">})</span>`;
            }
            
            const items = value.map(item => 
                `${indentStr}  ${this.formatTSValue(item, indent + 1)}`
            ).join('<span class="punctuation">,</span>\n');
            return `<span class="punctuation">[</span>\n${items}\n${indentStr}<span class="punctuation">]</span>`;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            if (entries.length === 0) return '<span class="punctuation">{}</span>';
            
            const formattedEntries = entries.map(([key, val]) => {
                const formattedKey = `<span class="key">"${key}"</span>`;
                return `${indentStr}  ${formattedKey}<span class="punctuation">:</span> ${this.formatTSValue(val, indent + 1)}`;
            }).join('<span class="punctuation">,</span>\n');
            
            return `<span class="punctuation">{</span>\n${formattedEntries}\n${indentStr}<span class="punctuation">}</span>`;
        }
        return String(value);
    }

    private wrapInCodeBlock(code: string, language: string = 'typescript'): string {
        // 为每一行添加行号和格式化
        const lines = code.split('\n').map((line, i) => 
            `<span class="line">${line}</span>`
        ).join('\n');
        
        return `<pre class="code-block ${language}"><code>${lines}</code></pre>`;
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

    public addMessage(message: string, isServerMessage: boolean = false) {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const timeFormat = config.get<string>('messages.timeFormat', 'HH:mm:ss');
        const showIcons = config.get<boolean>('messages.showIcons', true);
        const maxCount = config.get<number>('messages.maxCount', 1000);

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

        // 根据消息内容判断类型
        let type = 'info';
        let extraClass = '';
        let formattedMessage = message;

        // 检查消息类型
        if (message.startsWith('✅')) {
            type = 'success';
        } else if (message.startsWith('❌')) {
            type = 'error';
        } else if (message.startsWith('⚠️')) {
            type = 'warning';
        } else if (message.startsWith('🔧') || message.startsWith('🔌')) {
            type = 'system';
        } else if (message.startsWith('🔍 Eval结果:')) {
            type = 'eval-message';
        }

        // 检查是否包含JSON或TS对象
        if (message.includes('Eval结果:')) {
            try {
                const jsonStart = message.indexOf('\n') + 1;
                const jsonStr = message.substring(jsonStart).trim();
                
                // 使用parseLPCMapping解析LPC格式的数据
                const parsedData = this.parseLPCMapping(jsonStr);
                
                // 使用formatTSValue格式化数据
                const formattedJson = this.formatTSValue(parsedData);
                
                // 构建完整的消息HTML
                formattedMessage = `<div class="operation eval">🔍 Eval结果:</div>\n<div class="code-block"><code>${formattedJson}</code></div>`;
                extraClass += ' has-code';
            } catch (e) {
                console.error('解析失败:', e);
                // 如果解析失败,保持原始格式
                formattedMessage = `<div class="operation eval">🔍 Eval结果:</div>\n<div class="code-block"><code>${this.escapeHtml(message.substring(message.indexOf('\n') + 1))}</code></div>`;
            }
        }

        // 检查是否是编译错误消息
        const errorMatch = message.match(/❌ 编译错误:\s*文件:\s*([^\n]+)\s*行号:\s*(\d+)\s*错误:\s*(.*)/);
        if (errorMatch) {
          const [, filePath, line, errorMessage] = errorMatch;
          
            const messageHtml = `<div class="message ${isServerMessage ? 'server-message' : 'plugin-message'} error${extraClass}">
                <div class="message-header">
                    <span class="timestamp">[${timestamp}]</span>
                </div>
                <div class="message-content">
                    <div class="error-link" data-file="${filePath}" data-line="${line}">
                        <div class="error-title">❌ 编译错误</div>
                        <div class="error-details">
                            <div class="error-file">📄 ${filePath}</div>
                            <div class="error-line">📍 第 ${line} 行</div>
                            <div class="error-message">⚠️ ${errorMessage}</div>
                        </div>
                    </div>
                </div>
            </div>`;
            
            this._messages.push(messageHtml);
            this._view?.webview.postMessage({ 
                type: 'addMessage', 
                value: messageHtml,
                isError: true,
                errorData: { filePath, line: parseInt(line), message: errorMessage }
            });
        } else {
            // 添加操作类型样式
            if (message.includes('编译')) {
                formattedMessage = `<div class="operation compile">🔨 ${formattedMessage}</div>`;
            } else if (message.includes('连接成功')) {
                formattedMessage = `<div class="operation connect">🔌 ${formattedMessage}</div>`;
            } else if (message.includes('断开连接')) {
                formattedMessage = `<div class="operation disconnect">🔌 ${formattedMessage}</div>`;
            } else if (message.includes('登录')) {
                formattedMessage = `<div class="operation login">👤 ${formattedMessage}</div>`;
            } else if (message.includes('配置')) {
                formattedMessage = `<div class="operation config">⚙️ ${formattedMessage}</div>`;
            }

            // 构建消息HTML,确保类型样式正确应用
            const messageHtml = `<div class="message ${isServerMessage ? 'server-message' : 'plugin-message'} ${type}${extraClass}">
                <div class="message-header">
                    <span class="timestamp">[${timestamp}]</span>
                </div>
                <div class="message-content">${formattedMessage}</div>
            </div>`;
            
            this._messages.push(messageHtml);
            this._view?.webview.postMessage({ type: 'addMessage', value: messageHtml });
        }
    }

    public dispose() {
        // 清理资源
        this._messages = [];
        this._view = undefined;
    }
}
