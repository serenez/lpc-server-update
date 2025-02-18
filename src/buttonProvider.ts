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

    constructor(private readonly _extensionUri: vscode.Uri, private messageProvider: MessageProvider) {
        console.log('ButtonProvider constructor called');
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
                config.customCommands = this._customCommands;
                config.customEvals = this._customEvals;
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                console.log('Saved custom commands');
            }
        } catch (error) {
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

        if (isEval) {
            this._customEvals.push({ name, command });
        } else {
            this._customCommands.push({ name, command });
        }
        
        await this.saveCustomCommands();
        this.updateView();
    }

    private async deleteCustomCommand(index: number, isEval: boolean = false) {
        const commands = isEval ? this._customEvals : this._customCommands;
        commands.splice(index, 1);
        await this.saveCustomCommands();
        this.updateView();
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

        // 处理消息
        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(async message => {
                try {
                    console.log('Received message from webview:', message);
                    switch (message.type) {
                        case 'command':
                            console.log('Executing command:', message.command);
                            await vscode.commands.executeCommand(message.command);
                            break;
                        case 'customCommand':
                            console.log('Executing custom command:', message.command);
                            await vscode.commands.executeCommand('game-server-compiler.sendCommand', message.command);
                            break;
                        case 'customEval':
                            console.log('Executing custom eval:', message.command);
                            await vscode.commands.executeCommand('game-server-compiler.eval', message.command);
                            break;
                        case 'addCustomCommand':
                            await this.addCustomCommand(message.isEval);
                            break;
                        case 'deleteCustomCommand':
                            await this.deleteCustomCommand(message.index, message.isEval);
                            break;
                    }
                } catch (error) {
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

    private updateView() {
        if (this._view) {
            console.log('Updating view with state:', {
                connected: this._isConnected,
                loggedIn: this._isLoggedIn,
                initialized: this._isInitialized,
                customCommands: this._customCommands,
                customEvals: this._customEvals
            });
            this._view.webview.postMessage({ 
                type: 'updateState', 
                connected: this._isConnected,
                loggedIn: this._isLoggedIn,
                initialized: this._isInitialized,
                customCommands: this._customCommands,
                customEvals: this._customEvals
            });
        } else {
            console.log('View is not available');
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const buttonStyle = `
            body {
                padding: 10px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }
            .button-row {
                display: flex;
                gap: 8px;
                width: 100%;
            }
            .button-row button {
                flex: 1;
                min-width: 0;  /* 防止按钮溢出 */
                white-space: nowrap;  /* 防止文字换行 */
            }
            button {
                padding: 8px 16px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                font-size: 13px;
                transition: all 0.2s ease;
                min-height: 32px;
            }
            button:not(:disabled):hover {
                background: var(--vscode-button-hoverBackground);
            }
            button:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .connected {
                background: var(--vscode-statusBarItem-errorBackground);
            }
            .button-icon {
                font-size: 16px;
            }
            .divider {
                height: 1px;
                background: var(--vscode-panel-border);
                margin: 4px 0;
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
                background: var(--vscode-dropdown-background);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 4px;
                margin-top: 4px;
                overflow: hidden;
                padding: 4px;
                width: 100%;
                box-sizing: border-box;
            }
            .dropdown.open .dropdown-content {
                display: block;
            }
            .dropdown-items-container {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                width: 100%;
                box-sizing: border-box;
                padding: 0;
                margin: 0;
            }
            .dropdown-item {
                flex: 0 0 calc(50% - 2px);
                display: flex;
                align-items: center;
                padding: 6px 12px;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
                box-sizing: border-box;
                background: var(--vscode-button-secondaryBackground);
                border-radius: 4px;
                min-height: 32px;
                flex-shrink: 0;
            }
            .dropdown-item:hover {
                background: var(--vscode-list-hoverBackground);
            }
            .dropdown-item .delete-button {
                margin-left: auto;
                opacity: 0;
                transition: opacity 0.2s ease;
                color: var(--vscode-errorForeground);
            }
            .dropdown-item:hover .delete-button {
                opacity: 1;
            }
            .add-button {
                flex: 0 0 calc(50% - 8px);
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 6px 12px;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px dashed var(--vscode-button-border);
                margin: 4px;
                border-radius: 4px;
                min-height: 32px;
                flex-shrink: 0;
                cursor: pointer;
            }
            .add-button:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }
            .button-disabled {
                opacity: 0.5;
                cursor: not-allowed !important;
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
                            ${this._customCommands.map((cmd, index) => `
                                <div class="dropdown-item" data-command="${cmd.command}">
                                    <span class="button-icon">📎</span>
                                    <span>${cmd.name}</span>
                                    <span class="delete-button" data-index="${index}">🗑️</span>
                                </div>
                            `).join('')}
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
                            ${this._customEvals.map((cmd, index) => `
                                <div class="dropdown-item" data-command="${cmd.command}">
                                    <span class="button-icon">📎</span>
                                    <span>${cmd.name}</span>
                                    <span class="delete-button" data-index="${index}">🗑️</span>
                                </div>
                            `).join('')}
                            <button class="add-button" id="addCustomEval">
                                <span class="button-icon">➕</span>
                                <span>添加自定义Eval</span>
                            </button>
                        </div>
                    </div>
                </div>

                <button id="restart" disabled>
                    <span class="button-icon">🔃</span>
                    <span>重启服务器</span>
                </button>

                <div class="divider"></div>
                <button id="connect" class="${this._isConnected ? 'connected' : ''}">
                    <span class="button-icon">🔌</span>
                    <span>${this._isConnected ? '断开服务器' : '连接游戏服务器'}</span>
                </button>

                <script>
                    (function() {
                        const vscode = acquireVsCodeApi();
                        let state = {
                            connected: ${this._isConnected},
                            loggedIn: ${this._isLoggedIn},
                            initialized: ${this._isInitialized},
                            customCommands: ${JSON.stringify(this._customCommands)},
                            customEvals: ${JSON.stringify(this._customEvals)}
                        };

                        // 命令映射
                        const commands = {
                            'connect': 'game-server-compiler.connect',
                            'compile': 'game-server-compiler.compileCurrentFile',
                            'compileDir': 'game-server-compiler.compileDir',
                            'restart': 'game-server-compiler.restart'
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

                        // 更新自定义命令列表
                        function updateCustomCommandsList() {
                            const list = document.getElementById('customCommandsList');
                            if (list) {
                                const commands = state.customCommands.map((cmd, index) => {
                                    return '<div class="dropdown-item" data-command="' + cmd.command + '">' +
                                        '<span class="button-icon">📎</span>' +
                                        '<span>' + cmd.name + '</span>' +
                                        '<span class="delete-button" data-index="' + index + '">🗑️</span>' +
                                        '</div>';
                                }).join('');
                                
                                list.innerHTML = commands + 
                                    '<button class="add-button" id="addCustomCommand">' +
                                    '<span class="button-icon">➕</span>' +
                                    '<span>添加自定义命令</span>' +
                                    '</button>';
                                
                                bindCustomCommandEvents(list, false);
                            }
                        }

                        // 更新自定义Eval列表
                        function updateCustomEvalsList() {
                            const list = document.getElementById('customEvalsList');
                            if (list) {
                                const evals = state.customEvals.map((cmd, index) => {
                                    return '<div class="dropdown-item" data-command="' + cmd.command + '">' +
                                        '<span class="button-icon">📎</span>' +
                                        '<span>' + cmd.name + '</span>' +
                                        '<span class="delete-button" data-index="' + index + '">🗑️</span>' +
                                        '</div>';
                                }).join('');
                                
                                list.innerHTML = evals + 
                                    '<button class="add-button" id="addCustomEval">' +
                                    '<span class="button-icon">➕</span>' +
                                    '<span>添加Eval命令</span>' +
                                    '</button>';
                                
                                bindCustomCommandEvents(list, true);
                            }
                        }

                        // 绑定自定义命令事件
                        function bindCustomCommandEvents(list, isEval) {
                            // 绑定命令点击事件
                            list.querySelectorAll('.dropdown-item').forEach(item => {
                                item.addEventListener('click', (e) => {
                                    if (!e.target.classList.contains('delete-button')) {
                                        const command = item.dataset.command;
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

                            // 绑定删除按钮事件
                            list.querySelectorAll('.delete-button').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const index = parseInt(button.dataset.index);
                                    vscode.postMessage({ 
                                        type: 'deleteCustomCommand',
                                        index: index,
                                        isEval: isEval
                                    });
                                });
                            });

                            // 重新绑定添加按钮事件
                            const addButton = list.querySelector(isEval ? '#addCustomEval' : '#addCustomCommand');
                            if (addButton) {
                                addButton.addEventListener('click', () => {
                                    vscode.postMessage({ 
                                        type: 'addCustomCommand',
                                        isEval: isEval
                                    });
                                });
                            }
                        }

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
                        }

                        // 监听状态更新
                        window.addEventListener('message', event => {
                            const message = event.data;
                            console.log('Received message:', message);
                            
                            if (message.type === 'updateState') {
                                state = {
                                    connected: message.connected,
                                    loggedIn: message.loggedIn,
                                    initialized: message.initialized,
                                    customCommands: message.customCommands || [],
                                    customEvals: message.customEvals || []
                                };
                                updateButtons();
                                updateCustomCommandsList();
                                updateCustomEvalsList();
                            }
                        });

                        // 初始化
                        updateButtons();
                        updateCustomCommandsList();
                        updateCustomEvalsList();

                        // 点击外部关闭下拉菜单
                        document.addEventListener('click', (e) => {
                            const dropdowns = document.querySelectorAll('.dropdown');
                            dropdowns.forEach(dropdown => {
                                if (!dropdown.contains(e.target)) {
                                    dropdown.classList.remove('open');
                                }
                            });
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
