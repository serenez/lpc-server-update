import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageProvider } from './messageProvider';

interface CustomCommand {
    name: string;
    command: string;
}

export class ButtonProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _isConnected: boolean = false;
    private _isLoggedIn: boolean = false;
    private _isInitialized: boolean = false;
    private _disposables: vscode.Disposable[] = [];
    private _customCommands: CustomCommand[] = [];
    private _customEvals: CustomCommand[] = [];
    private _outputChannel: vscode.OutputChannel;

    constructor(private readonly _extensionUri: vscode.Uri, private messageProvider: MessageProvider) {
        console.log('ButtonProvider constructor called');
        this._outputChannel = vscode.window.createOutputChannel('游戏服务器编译器');
        this.initializeAsync();
    }

    private async initializeAsync() {
        try {
            await this.loadCustomCommands();
            this._isInitialized = true;
            this.updateView();
            console.log('ButtonProvider initialization completed');
        } catch (error) {
            console.error('ButtonProvider initialization failed:', error);
            this.messageProvider.addMessage('❌ 插件初始化失败，请重启VS Code');
        }
    }

    private loadCustomCommands() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) return;

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                this._customCommands = config.customCommands || [];
                this._customEvals = config.customEvals || [];
                console.log('Loaded custom commands:', this._customCommands);
                console.log('Loaded custom evals:', this._customEvals);
            }
        } catch (error) {
            console.error('Failed to load custom commands:', error);
        }
    }

    private async saveCustomCommands() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) return;

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                this._outputChannel.appendLine('==== 保存自定义命令 ====');
                this._outputChannel.appendLine('自定义命令列表:');
                this._customCommands.forEach(cmd => {
                    this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
                });
                this._outputChannel.appendLine('Eval命令列表:');
                this._customEvals.forEach(cmd => {
                    this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
                });
                
                config.customCommands = this._customCommands;
                config.customEvals = this._customEvals;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            }
        } catch (error) {
            this._outputChannel.appendLine(`保存自定义命令失败: ${error}`);
            console.error('Failed to save custom commands:', error);
        }
    }

    private async addCustomCommand(isEval: boolean = false) {
        const name = await vscode.window.showInputBox({
            prompt: `输入${isEval ? 'Eval命令' : '自定义命令'}名称`,
            placeHolder: '例如: 查看在线玩家'
        });
        if (!name) return;

        const command = await vscode.window.showInputBox({
            prompt: `输入${isEval ? 'Eval命令' : '自定义命令'}内容`,
            placeHolder: isEval ? 'memory_info()' : 'users'
        });
        if (!command) return;

        this._outputChannel.appendLine(`==== 添加${isEval ? 'Eval' : '自定义'}命令 ====`);
        this._outputChannel.appendLine(`命令名称: ${name}`);
        this._outputChannel.appendLine(`命令内容: ${command}`);

        if (isEval) {
            this._customEvals.push({ name, command });
        } else {
            this._customCommands.push({ name, command });
        }
        
        await this.saveCustomCommands();
        
        // 立即更新WebView
        if (this._view) {
            // 生成新的命令HTML
            const commandsHtml = this.generateCommandsHtml(isEval);
            
            // 发送更新消息到WebView
            this._view.webview.postMessage({
                type: 'updateCommands',
                isEval: isEval,
                html: commandsHtml
            });
        }
    }

    // 添加新方法：生成命令HTML
    private generateCommandsHtml(isEval: boolean): string {
        const commands = isEval ? this._customEvals : this._customCommands;
        return commands.map((cmd, index) => `
            <div class="dropdown-item" data-command="${this.escapeHtml(cmd.command)}">
                <span class="button-icon">📎</span>
                <span>${this.escapeHtml(cmd.name)}</span>
                <div class="button-group">
                    <span class="edit-button" data-index="${index}" title="编辑">✏️</span>
                    <span class="delete-button" data-index="${index}" title="删除">🗑️</span>
                </div>
            </div>
        `).join('');
    }

    // 添加HTML转义方法
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

    private async deleteCustomCommand(index: number, isEval: boolean = false) {
        const commands = isEval ? this._customEvals : this._customCommands;
        commands.splice(index, 1);
        await this.saveCustomCommands();
        
        // 立即更新WebView
        if (this._view) {
            const commandsHtml = this.generateCommandsHtml(isEval);
            this._view.webview.postMessage({
                type: 'updateCommands',
                isEval: isEval,
                html: commandsHtml
            });
        }
    }

    private async editCustomCommand(index: number, isEval: boolean = false) {
        const commands = isEval ? this._customEvals : this._customCommands;
        const command = commands[index];
        
        if (!command) return;

        const name = await vscode.window.showInputBox({
            prompt: `修改${isEval ? 'Eval命令' : '自定义命令'}名称`,
            value: command.name,
            placeHolder: '例如: 查看在线玩家'
        });
        if (!name) return;

        const commandStr = await vscode.window.showInputBox({
            prompt: `修改${isEval ? 'Eval命令' : '自定义命令'}内容`,
            value: command.command,
            placeHolder: isEval ? 'memory_info()' : 'users'
        });
        if (!commandStr) return;

        commands[index] = { name, command: commandStr };
        await this.saveCustomCommands();
        
        // 立即更新WebView
        if (this._view) {
            const commandsHtml = this.generateCommandsHtml(isEval);
            this._view.webview.postMessage({
                type: 'updateCommands',
                isEval: isEval,
                html: commandsHtml
            });
        }
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 设置初始HTML
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // 🚀 监听配置文件变化，实时更新配置显示
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (workspaceRoot) {
            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                let configUpdateTimer: NodeJS.Timeout | null = null;
                const configWatcher = fs.watch(configPath, (eventType) => {
                    if (eventType === 'change') {
                        // 🚀 防抖：清除之前的定时器，重新计时
                        if (configUpdateTimer) {
                            clearTimeout(configUpdateTimer);
                        }
                        // 延迟200ms，确保文件写入完成
                        configUpdateTimer = setTimeout(() => {
                            try {
                                // 检查文件内容是否为空
                                const configData = fs.readFileSync(configPath, 'utf8');
                                if (configData && configData.trim() !== '') {
                                    this._outputChannel.appendLine('==== 配置文件已修改 ====');
                                    this.updateView();
                                }
                                // 文件为空时不输出日志，这是正常的文件保存过程
                            } catch (error) {
                                // 只在真正读取失败时输出错误
                                this._outputChannel.appendLine(`读取配置文件失败: ${error}`);
                            }
                            configUpdateTimer = null;
                        }, 200);
                    }
                });
                this._disposables.push(new vscode.Disposable(() => {
                    if (configUpdateTimer) {
                        clearTimeout(configUpdateTimer);
                    }
                    configWatcher.close();
                }));
            }
        }

        // 处理消息
        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(async message => {
                try {
                    this._outputChannel.appendLine('==== 接收WebView消息 ====');
                    this._outputChannel.appendLine(`消息类型: ${message.type}`);
                    
                    switch (message.type) {
                        case 'command':
                            this._outputChannel.appendLine(`执行命令: ${message.command}`);
                            await vscode.commands.executeCommand(message.command);
                            break;
                        case 'customCommand':
                            this._outputChannel.appendLine(`执行自定义命令: ${message.command}`);
                            await vscode.commands.executeCommand('game-server-compiler.sendCommand', message.command);
                            break;
                        case 'customEval':
                            this._outputChannel.appendLine(`执行Eval命令: ${message.command}`);
                            await vscode.commands.executeCommand('game-server-compiler.eval', message.command);
                            break;
                        case 'addCustomCommand':
                            this._outputChannel.appendLine(`添加${message.isEval ? 'Eval' : '自定义'}命令`);
                            await this.addCustomCommand(message.isEval);
                            break;
                        case 'editCustomCommand':
                            this._outputChannel.appendLine(`编辑${message.isEval ? 'Eval' : '自定义'}命令: index=${message.index}`);
                            await this.editCustomCommand(message.index, message.isEval);
                            break;
                        case 'deleteCustomCommand':
                            this._outputChannel.appendLine(`删除${message.isEval ? 'Eval' : '自定义'}命令: index=${message.index}`);
                            await this.deleteCustomCommand(message.index, message.isEval);
                            break;
                    }
                } catch (error) {
                    this._outputChannel.appendLine(`命令执行错误: ${error}`);
                    console.error('命令执行错误:', error);
                    vscode.window.showErrorMessage(`命令执行失败: ${error}`);
                }
            })
        );
    }

    public updateConnectionState(isConnected: boolean) {
        console.log('Updating connection state:', isConnected);
        this._isConnected = isConnected;
        if (!isConnected) {
            this._isLoggedIn = false;
        }
        this.updateView();
    }

    public updateButtonState(isLoggedIn: boolean) {
        console.log('Updating button state:', isLoggedIn);
        this._isLoggedIn = isLoggedIn;
        this.updateView();
    }

    /**
     * 🚀 获取当前配置信息
     */
    private getCurrentConfig() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            const configPath = path.join(workspaceRoot || '', '.vscode', 'muy-lpc-update.json');

            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                return JSON.parse(configData);
            }
        } catch (error) {
            console.error('Failed to get current config:', error);
        }
        return { rootPath: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '' };
    }

    private updateView() {
        if (this._view) {
            this._outputChannel.appendLine('==== 更新视图 ====');
            this._outputChannel.appendLine(`连接状态: ${this._isConnected}`);
            this._outputChannel.appendLine(`登录状态: ${this._isLoggedIn}`);
            this._outputChannel.appendLine(`初始化状态: ${this._isInitialized}`);
            this._outputChannel.appendLine('自定义命令:');
            this._customCommands.forEach(cmd => {
                this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
            });
            this._outputChannel.appendLine('Eval命令:');
            this._customEvals.forEach(cmd => {
                this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
            });

            // 发送状态更新消息
            this._view.webview.postMessage({
                type: 'updateState',
                connected: this._isConnected,
                loggedIn: this._isLoggedIn,
                initialized: this._isInitialized,
                customCommands: this._customCommands,
                customEvals: this._customEvals,
                config: this.getCurrentConfig()
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const buttonStyle = `
            body {
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 12px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            .button-row {
                display: flex;
                gap: 12px;
                width: 100%;
            }
            
            .button-row button {
                flex: 1;
                min-width: 0;
            }
            
            button {
                padding: 10px 18px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 8px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                min-height: 36px;
                position: relative;
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
                backdrop-filter: blur(10px);
            }
            
            button:not(:disabled):hover {
                background: var(--vscode-button-hoverBackground);
                transform: translateY(-1px);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2),
                            0 4px 8px rgba(0, 0, 0, 0.1);
            }
            
            button:not(:disabled):active {
                transform: translateY(0);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
            }
            
            button:disabled {
                opacity: 0.6;
                cursor: not-allowed;
                filter: saturate(0.8);
            }
            
            .connected {
                background: var(--vscode-statusBarItem-errorBackground);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
            }
            
            .button-icon {
                font-size: 16px;
                line-height: 1;
            }
            
            .divider {
                height: 1px;
                background: var(--vscode-panel-border);
                margin: 8px 0;
                opacity: 0.3;
            }
            
            .dropdown {
                position: relative;
                width: 100%;
            }
            
            .dropdown-button {
                width: 100%;
                text-align: left;
                justify-content: flex-start;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
            }
            
            .dropdown-content {
                display: none;
                position: relative;
                background: color-mix(in srgb, var(--vscode-dropdown-background) 80%, transparent);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 10px;
                margin-top: 6px;
                overflow: hidden;
                padding: 6px;
                width: 100%;
                box-sizing: border-box;
                backdrop-filter: blur(20px);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                animation: dropdownFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            @keyframes dropdownFadeIn {
                from {
                    opacity: 0;
                    transform: translateY(-4px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .dropdown.open .dropdown-content {
                display: block;
            }
            
            .dropdown-items-container {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
                gap: 6px;
                width: 100%;
                box-sizing: border-box;
                padding: 0;
                margin: 0;
            }
            
            .dropdown-item {
                display: flex;
                align-items: center;
                padding: 8px 14px;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                box-sizing: border-box;
                background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 90%, transparent);
                border-radius: 6px;
                min-height: 36px;
                position: relative;
                backdrop-filter: blur(10px);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
            }
            
            .dropdown-item:hover {
                background: var(--vscode-list-hoverBackground);
                transform: translateY(-1px);
                box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1),
                            0 2px 4px rgba(0, 0, 0, 0.05);
            }
            
            .dropdown-item:active {
                transform: translateY(0);
            }
            
            .dropdown-item .button-group {
                margin-left: auto;
                display: flex;
                gap: 4px;
                opacity: 0;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .dropdown-item:hover .button-group {
                opacity: 1;
            }
            
            .edit-button,
            .delete-button {
                padding: 2px 6px;
                border-radius: 4px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .edit-button:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            
            .delete-button:hover {
                background: rgba(255, 0, 0, 0.1);
            }
            
            .add-button {
                grid-column: 1 / -1;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px 14px;
                background: color-mix(in srgb, var(--vscode-button-secondaryBackground) 70%, transparent);
                color: var(--vscode-button-secondaryForeground);
                border: 1px dashed color-mix(in srgb, var(--vscode-button-border) 50%, transparent);
                margin: 4px 0;
                border-radius: 6px;
                min-height: 36px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                backdrop-filter: blur(10px);
            }
            
            .add-button:hover {
                background: var(--vscode-button-secondaryHoverBackground);
                transform: translateY(-1px);
                border-style: solid;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
            }
            
            .add-button:active {
                transform: translateY(0);
            }
            
            .button-disabled {
                opacity: 0.6;
                cursor: not-allowed !important;
                filter: saturate(0.8);
            }
            
            /* 添加平滑滚动 */
            * {
                scroll-behavior: smooth;
            }
            
            /* 自定义滚动条 */
            ::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            ::-webkit-scrollbar-track {
                background: transparent;
            }
            
            ::-webkit-scrollbar-thumb {
                background: var(--vscode-scrollbarSlider-background);
                border-radius: 4px;
            }
            
            ::-webkit-scrollbar-thumb:hover {
                background: var(--vscode-scrollbarSlider-hoverBackground);
            }

            /* 🚀 配置显示区样式 */
            .config-display {
                margin-top: 12px;
                padding: 12px;
                background: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                font-size: 12px;
                backdrop-filter: blur(10px);
            }

            .config-item {
                display: flex;
                flex-direction: column;
                padding: 8px 0;
                gap: 4px;
            }

            .config-item .config-label {
                color: var(--vscode-descriptionForeground);
                font-weight: 500;
                font-size: 11px;
                opacity: 0.7;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .config-item .config-value {
                color: #4FC3F7; /* 🚀 鲜艳的粉红色 */
                flex: 1;
                font-family: 'Courier New', monospace;
                word-break: break-all;
                font-size: 13px; /* 🚀 字体加大 */
                font-weight: 500;
                padding-left: 26px; /* 🚀 与图标对齐 */
                line-height: 1.4;
            }

            .config-item .config-icon {
                font-size: 14px;
                opacity: 0.7;
            }

            .config-item .config-value.empty {
                color: var(--vscode-descriptionForeground);
                opacity: 0.5;
                font-style: italic;
                font-size: 12px;
            }

            /* 🚀 连接地址特殊颜色 */
            #config-hostPort {
                color: #2196F3; /* 🚀 鲜艳的蓝色 */
            }
        `;

        const customCommandsHtml = this._customCommands.map((cmd, index) => `
            <div class="dropdown-item" data-command="${this.escapeHtml(cmd.command)}">
                <span class="button-icon">📎</span>
                <span>${this.escapeHtml(cmd.name)}</span>
                <div class="button-group">
                    <span class="edit-button" data-index="${index}" title="编辑">✏️</span>
                    <span class="delete-button" data-index="${index}" title="删除">🗑️</span>
                </div>
            </div>
        `).join('');

        const customEvalsHtml = this._customEvals.map((cmd, index) => `
            <div class="dropdown-item" data-command="${this.escapeHtml(cmd.command)}">
                <span class="button-icon">📎</span>
                <span>${this.escapeHtml(cmd.name)}</span>
                <div class="button-group">
                    <span class="edit-button" data-index="${index}" title="编辑">✏️</span>
                    <span class="delete-button" data-index="${index}" title="删除">🗑️</span>
                </div>
            </div>
        `).join('');

        return `<!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${buttonStyle}</style>
            </head>
            <body>
                <div class="button-row">
                    <button id="compile" disabled>
                        <span class="button-icon">🔨</span>
                        <span>编译当前文件</span>
                    </button>
                    <button id="compileDir" disabled>
                        <span class="button-icon">📁</span>
                        <span>编译目录</span>
                    </button>
                </div>
                
                <div class="dropdown">
                    <button class="dropdown-button" id="customCommandsDropdown" disabled>
                        <span class="button-icon">⌨️</span>
                        <span>自定义命令</span>
                        <span style="margin-left: auto">▼</span>
                    </button>
                    <div class="dropdown-content" id="customCommandsList">
                        <div class="dropdown-items-container">
                            ${customCommandsHtml}
                            <button class="add-button" id="addCustomCommand">
                                <span class="button-icon">➕</span>
                                <span>添加自定义命令</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="dropdown">
                    <button class="dropdown-button" id="customEvalsDropdown" disabled>
                        <span class="button-icon">📝</span>
                        <span>自定义Eval</span>
                        <span style="margin-left: auto">▼</span>
                    </button>
                    <div class="dropdown-content" id="customEvalsList">
                        <div class="dropdown-items-container">
                            ${customEvalsHtml}
                            <button class="add-button" id="addCustomEval">
                                <span class="button-icon">➕</span>
                                <span>添加自定义Eval</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="button-row">
                    <button id="restart" disabled>
                        <span class="button-icon">🔃</span>
                        <span>重启服务器</span>
                    </button>
                    <button id="resetProjectPath">
                        <span class="button-icon">🔄</span>
                        <span>重置项目路径</span>
                    </button>
                </div>

                <div class="divider"></div>
                <button id="connect" class="${this._isConnected ? 'connected' : ''}">
                    <span class="button-icon">🔌</span>
                    <span>${this._isConnected ? '断开服务器' : '连接游戏服务器'}</span>
                </button>

                <!-- 🚀 配置显示区 -->
                <div class="config-display">
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">📁</span>
                            <span>工作目录</span>
                        </div>
                        <div class="config-value" id="config-rootPath">未配置</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">🌐</span>
                            <span>连接地址</span>
                        </div>
                        <div class="config-value" id="config-hostPort">未配置</div>
                    </div>
                </div>

                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        let state = {
                            connected: ${this._isConnected},
                            loggedIn: ${this._isLoggedIn},
                            initialized: ${this._isInitialized},
                            customCommands: ${JSON.stringify(this._customCommands)},
                            customEvals: ${JSON.stringify(this._customEvals)},
                            config: ${JSON.stringify(this.getCurrentConfig())}
                        };

                        // 命令映射
                        const commands = {
                            'connect': 'game-server-compiler.connect',
                            'compile': 'game-server-compiler.compileCurrentFile',
                            'compileDir': 'game-server-compiler.compileDir',
                            'restart': 'game-server-compiler.restart',
                            'resetProjectPath': 'game-server-compiler.resetProjectPath'
                        };

                        // 绑定基础按钮事件
                        Object.keys(commands).forEach(id => {
                            const button = document.getElementById(id);
                            if (button) {
                                button.addEventListener('click', () => {
                                    console.log('Button clicked:', id);
                                    vscode.postMessage({ 
                                        type: 'command',
                                        command: commands[id]
                                    });
                                });
                            }
                        });

                        // 绑定下拉菜单事件
                        ['customCommandsDropdown', 'customEvalsDropdown'].forEach(id => {
                            const dropdown = document.getElementById(id);
                            if (dropdown) {
                                dropdown.addEventListener('click', () => {
                                    dropdown.parentElement.classList.toggle('open');
                                });
                            }
                        });

                        // 绑定添加命令按钮
                        document.getElementById('addCustomCommand')?.addEventListener('click', () => {
                            vscode.postMessage({ 
                                type: 'addCustomCommand',
                                isEval: false
                            });
                        });

                        document.getElementById('addCustomEval')?.addEventListener('click', () => {
                            vscode.postMessage({ 
                                type: 'addCustomCommand',
                                isEval: true
                            });
                        });

                        // 绑定自定义命令事件
                        function bindCustomCommandEvents(container, isEval) {
                            console.log('Binding events for', isEval ? 'eval' : 'custom', 'commands');
                            
                            // 绑定命令点击事件
                            container.querySelectorAll('.dropdown-item').forEach(item => {
                                item.addEventListener('click', (e) => {
                                    if (!e.target.classList.contains('delete-button') && 
                                        !e.target.classList.contains('edit-button')) {
                                        const command = item.dataset.command;
                                        console.log('Command clicked:', command);
                                        if (isEval) {
                                            vscode.postMessage({ 
                                                type: 'customEval',
                                                command: command
                                            });
                                        } else {
                                            vscode.postMessage({ 
                                                type: 'customCommand',
                                                command: command
                                            });
                                        }
                                    }
                                });
                            });

                            // 绑定编辑按钮事件
                            container.querySelectorAll('.edit-button').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const index = parseInt(button.dataset.index);
                                    console.log('Edit button clicked:', index);
                                    vscode.postMessage({ 
                                        type: 'editCustomCommand',
                                        index: index,
                                        isEval: isEval
                                    });
                                });
                            });

                            // 绑定删除按钮事件
                            container.querySelectorAll('.delete-button').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const index = parseInt(button.dataset.index);
                                    console.log('Delete button clicked:', index);
                                    vscode.postMessage({ 
                                        type: 'deleteCustomCommand',
                                        index: index,
                                        isEval: isEval
                                    });
                                });
                            });
                        }

                        // 初始化时绑定事件
                        const commandsList = document.getElementById('customCommandsList');
                        const evalsList = document.getElementById('customEvalsList');
                        if (commandsList) {
                            const container = commandsList.querySelector('.dropdown-items-container');
                            if (container) bindCustomCommandEvents(container, false);
                        }
                        if (evalsList) {
                            const container = evalsList.querySelector('.dropdown-items-container');
                            if (container) bindCustomCommandEvents(container, true);
                        }

                        // 点击外部关闭下拉菜单
                        document.addEventListener('click', (e) => {
                            const dropdowns = document.querySelectorAll('.dropdown');
                            dropdowns.forEach(dropdown => {
                                if (!dropdown.contains(e.target)) {
                                    dropdown.classList.remove('open');
                                }
                            });
                        });

                        // 更新按钮状态
                        function updateButtons() {
                            Object.keys(commands).forEach(id => {
                                const button = document.getElementById(id);
                                if (button) {
                                    if (id === 'connect') {
                                        // 连接按钮的处理
                                        button.disabled = !state.initialized;
                                        button.className = state.initialized ?
                                            (state.connected ? 'connected' : '') :
                                            'button-disabled';
                                        // 更新连接按钮的文字
                                        const textSpan = button.querySelector('span:last-child');
                                        if (textSpan) {
                                            textSpan.textContent = state.connected ? '断开服务器' : '连接游戏服务器';
                                        }
                                    } else if (id === 'resetProjectPath') {
                                        // 🚀 "重置项目路径"按钮始终可用
                                        button.disabled = false;
                                    } else {
                                        // 其他按钮的处理
                                        button.disabled = !state.initialized || !state.connected || !state.loggedIn;
                                    }
                                }
                            });

                            // 更新下拉菜单状态
                            ['customCommandsDropdown', 'customEvalsDropdown'].forEach(id => {
                                const button = document.getElementById(id);
                                if (button) {
                                    button.disabled = !state.initialized || !state.connected || !state.loggedIn;
                                }
                            });

                            // 🚀 更新配置显示
                            updateConfigDisplay();
                        }

                        // 更新配置显示
                        function updateConfigDisplay() {
                            const rootPathEl = document.getElementById('config-rootPath');
                            const hostPortEl = document.getElementById('config-hostPort');

                            if (rootPathEl) {
                                if (state.config && state.config.rootPath) {
                                    rootPathEl.textContent = state.config.rootPath;
                                    rootPathEl.classList.remove('empty');
                                } else {
                                    rootPathEl.textContent = '未配置';
                                    rootPathEl.classList.add('empty');
                                }
                            }

                            if (hostPortEl) {
                                if (state.config && state.config.host && state.config.port) {
                                    // 🚀 修复：直接拼接变量，不要用字符串字面量
                                    hostPortEl.textContent = state.config.host + ':' + state.config.port;
                                    hostPortEl.classList.remove('empty');
                                } else {
                                    hostPortEl.textContent = '未配置';
                                    hostPortEl.classList.add('empty');
                                }
                            }
                        }

                        // 初始化时更新按钮状态
                        updateButtons();

                        // 监听状态更新消息
                        window.addEventListener('message', event => {
                            const message = event.data;
                            console.log('Received message:', message);
                            
                            if (message.type === 'updateState') {
                                state = {
                                    ...state,
                                    ...message
                                };
                                updateButtons();
                            }
                        });

                        // 监听状态更新
                        window.addEventListener('message', event => {
                            const message = event.data;
                            switch (message.type) {
                                case 'updateCommands':
                                    // 更新命令列表
                                    const container = message.isEval ? 
                                        document.querySelector('#customEvalsList .dropdown-items-container') :
                                        document.querySelector('#customCommandsList .dropdown-items-container');
                                    
                                    if (container) {
                                        // 保留添加按钮
                                        const addButton = container.querySelector('.add-button');
                                        // 更新命令列表HTML
                                        container.innerHTML = message.html;
                                        // 重新添加添加按钮
                                        container.appendChild(addButton);
                                        // 重新绑定事件
                                        bindCustomCommandEvents(container, message.isEval);
                                    }
                                    break;
                                // ... existing cases ...
                            }
                        });
                    })();
                </script>
            </body>
            </html>`;
    }

    dispose() {
        this._disposables.forEach(d => d.dispose());
    }
} 
