import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MessageProvider } from './messageProvider';
import { ConfigManager } from './config/ConfigManager';
import { LogManager, LogLevel } from './log/LogManager';
import { PathConverter } from './utils/PathConverter';
import {
    describeCompilerDiagnosticMessageLanguage,
    normalizeCompilerDiagnosticMessageLanguage
} from './utils/compilerDiagnosticLocalization';

interface CustomCommand {
    name: string;
    command: string;
}

interface FavoriteFile {
    name: string;
    path: string;
}

interface LocalCompileUiState {
    lpccPathLabel: string;
    configPathLabel: string;
    showWarnings: boolean;
    autoCompileOnSave: boolean;
    messageLanguageLabel: string;
}

function createSilentOutputChannel(): vscode.OutputChannel {
    return {
        name: 'silent-button-provider',
        append() {},
        appendLine() {},
        clear() {},
        replace() {},
        show() {},
        hide() {},
        dispose() {}
    } as vscode.OutputChannel;
}

export class ButtonProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _isConnected: boolean = false;
    private _isLoggedIn: boolean = false;
    private _isInitialized: boolean = false;
    private _disposables: vscode.Disposable[] = [];
    private _customCommands: CustomCommand[] = [];
    private _customEvals: CustomCommand[] = [];
    private _favoriteFiles: FavoriteFile[] = [];
    private _outputChannel: vscode.OutputChannel;
    private _configManager: ConfigManager; // 🚀 新增：配置管理器引用

    constructor(private readonly _extensionUri: vscode.Uri, private messageProvider: MessageProvider) {
        console.log('ButtonProvider constructor called');
        this._outputChannel = createSilentOutputChannel();
        this._configManager = ConfigManager.getInstance(); // 🚀 获取配置管理器实例
        this._configManager.onConfigChanged(() => {
            this.loadCustomCommands();
            this.updateView();
        });
        this._configManager.onProfileChanged(() => {
            this.updateView();
        });
        this.initializeAsync();
    }

    private async initializeAsync() {
        try {
            this.loadCustomCommands();
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
            const auxiliaryData = this._configManager.getAuxiliaryData();
            this._customCommands = this.normalizeCustomCommandList(auxiliaryData.customCommands);
            this._customEvals = this.normalizeCustomCommandList(auxiliaryData.customEvals);
            this._favoriteFiles = this.normalizeFavoriteFileList(auxiliaryData.favoriteFiles);
            console.log('Loaded custom commands:', this._customCommands);
            console.log('Loaded custom evals:', this._customEvals);
            console.log('Loaded favorite files:', this._favoriteFiles);
        } catch (error) {
            console.error('Failed to load custom commands:', error);
        }
    }

    private async saveCustomCommands() {
        try {
            await this._configManager.ensureConfigExists();
            this._outputChannel.appendLine('==== 保存自定义命令 ====');
            this._outputChannel.appendLine('自定义命令列表:');
            this._customCommands.forEach(cmd => {
                this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
            });
            this._outputChannel.appendLine('Eval命令列表:');
            this._customEvals.forEach(cmd => {
                this._outputChannel.appendLine(`- ${cmd.name}: ${cmd.command}`);
            });
            this._outputChannel.appendLine('常用文件列表:');
            this._favoriteFiles.forEach(file => {
                this._outputChannel.appendLine(`- ${file.name}: ${file.path}`);
            });

            await this._configManager.updateAuxiliaryData({
                customCommands: this._customCommands,
                customEvals: this._customEvals,
                favoriteFiles: this._favoriteFiles
            });
        } catch (error) {
            this._outputChannel.appendLine(`保存自定义命令失败: ${error}`);
            console.error('Failed to save custom commands:', error);
        }
    }

    private normalizeCustomCommandList(rawList: unknown): CustomCommand[] {
        if (!Array.isArray(rawList)) {
            return [];
        }

        return rawList
            .map((item): CustomCommand | undefined => {
                if (!item || typeof item !== 'object') {
                    return undefined;
                }
                const { name, command } = item as Partial<CustomCommand>;
                if (typeof name !== 'string' || typeof command !== 'string') {
                    return undefined;
                }
                return {
                    name: name.trim(),
                    command: command.trim()
                };
            })
            .filter((item): item is CustomCommand => !!item && !!item.name && !!item.command);
    }

    private normalizeFavoriteFileList(rawList: unknown): FavoriteFile[] {
        if (!Array.isArray(rawList)) {
            return [];
        }

        return rawList
            .map((item): FavoriteFile | undefined => {
                if (typeof item === 'string') {
                    const normalizedPath = item.trim();
                    if (!normalizedPath) {
                        return undefined;
                    }
                    return { name: path.basename(normalizedPath), path: normalizedPath };
                }

                if (!item || typeof item !== 'object') {
                    return undefined;
                }

                const favorite = item as Partial<FavoriteFile>;
                if (typeof favorite.path !== 'string' || !favorite.path.trim()) {
                    return undefined;
                }

                return {
                    name: typeof favorite.name === 'string' && favorite.name.trim()
                        ? favorite.name.trim()
                        : path.basename(favorite.path),
                    path: favorite.path.trim()
                };
            })
            .filter((item): item is FavoriteFile => !!item && !!item.path);
    }

    private async addCustomCommand(isEval: boolean = false) {
        const name = await vscode.window.showInputBox({
            prompt: `输入${isEval ? 'Eval命令' : '自定义命令'}名称`,
            placeHolder: '例如: 查看在线玩家'
        });
        if (!name) {return;}

        const command = await vscode.window.showInputBox({
            prompt: `输入${isEval ? 'Eval命令' : '自定义命令'}内容`,
            placeHolder: isEval ? 'memory_info()' : 'users'
        });
        if (!command) {return;}

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

        if (!command) {return;}

        const name = await vscode.window.showInputBox({
            prompt: `修改${isEval ? 'Eval命令' : '自定义命令'}名称`,
            value: command.name,
            placeHolder: '例如: 查看在线玩家'
        });
        if (!name) {return;}

        const commandStr = await vscode.window.showInputBox({
            prompt: `修改${isEval ? 'Eval命令' : '自定义命令'}内容`,
            value: command.command,
            placeHolder: isEval ? 'memory_info()' : 'users'
        });
        if (!commandStr) {return;}

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

    private async addFavoriteCurrentFile() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('没有打开的文件，无法添加到常用文件');
            return;
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            vscode.window.showWarningMessage('未找到工作区，无法添加常用文件');
            return;
        }

        const filePath = editor.document.uri.fsPath;
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
        if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            vscode.window.showWarningMessage('当前文件不在工作区内，无法添加到常用文件');
            return;
        }

        if (this._favoriteFiles.some(file => file.path === relativePath)) {
            vscode.window.showInformationMessage('该文件已在常用文件中');
            return;
        }

        this._favoriteFiles.push({
            name: path.basename(filePath),
            path: relativePath
        });
        await this.saveCustomCommands();
        this.refreshFavoriteFilesInView();
        vscode.window.showInformationMessage(`已添加常用文件: ${relativePath}`);
    }

    private async openFavoriteFile(relativePath: string) {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('未找到工作区，无法打开常用文件');
            return;
        }

        const fullPath = path.join(workspaceRoot, relativePath);
        if (!fs.existsSync(fullPath)) {
            vscode.window.showErrorMessage(`文件不存在: ${relativePath}`);
            return;
        }

        const doc = await vscode.workspace.openTextDocument(fullPath);
        await vscode.window.showTextDocument(doc, { preview: false });
    }

    private async deleteFavoriteFile(index: number) {
        if (index < 0 || index >= this._favoriteFiles.length) {
            return;
        }
        this._favoriteFiles.splice(index, 1);
        await this.saveCustomCommands();
        this.refreshFavoriteFilesInView();
    }

    private generateFavoriteFilesHtml(): string {
        return this._favoriteFiles.map((file, index) => `
            <div class="dropdown-item" data-file-path="${this.escapeHtml(file.path)}">
                <span class="button-icon">📄</span>
                <span title="${this.escapeHtml(file.path)}">${this.escapeHtml(file.name)}</span>
                <div class="button-group">
                    <span class="delete-favorite-button" data-index="${index}" title="移除">🗑️</span>
                </div>
            </div>
        `).join('');
    }

    private refreshFavoriteFilesInView() {
        if (!this._view) {
            return;
        }
        this._view.webview.postMessage({
            type: 'updateFavoriteFiles',
            html: this.generateFavoriteFilesHtml()
        });
        this._view.webview.postMessage({
            type: 'updateState',
            favoriteFiles: this._favoriteFiles
        });
    }

    // 🚀 ========== 新增：配置切换处理 ==========

    /**
     * 🚀 处理配置切换
     */
    private async handleSwitchProfile(profileId: string): Promise<void> {
        try {
            this._outputChannel.appendLine(`==== 切换配置环境 ====`);
            this._outputChannel.appendLine(`目标配置: ${profileId}`);

            // 切换配置
            await this._configManager.switchProfile(profileId);

            // 更新UI
            this.updateView();

            // 显示提示
            const profiles = this._configManager.getAllProfiles();
            const profile = profiles[profileId];
            vscode.window.showInformationMessage(
                `已切换到配置: ${profile?.name || profileId}`
            );

            this._outputChannel.appendLine(`配置切换成功: ${profile?.name || profileId}`);
        } catch (error) {
            this._outputChannel.appendLine(`切换配置失败: ${error}`);
            vscode.window.showErrorMessage(`切换配置失败: ${error}`);
        }
    }

    /**
     * 🚀 处理添加新配置
     */
    private async handleAddProfile(): Promise<void> {
        try {
            this._outputChannel.appendLine(`==== 添加新配置 ====`);
            const logger = LogManager.getInstance();
            logger.log('开始添加新配置', LogLevel.INFO);

            // 输入配置名称
            const profileName = await vscode.window.showInputBox({
                prompt: '输入新配置的名称（例如：测试服务器、生产环境）',
                placeHolder: '配置1',
                ignoreFocusOut: true
            });

            if (!profileName) {
                this._outputChannel.appendLine('用户取消添加配置');
                return;
            }

            // 生成配置ID（使用时间戳确保唯一）
            const profileId = `profile_${Date.now()}`;

            // 获取当前工作区路径作为默认值
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';

            // 创建新配置（复制当前配置作为模板）
            const currentConfig = this._configManager.getConfig();
            const newProfile: any = {
                name: profileName,
                host: '',  // 清空，让用户重新配置
                port: 0,
                username: '',
                password: '',
                rootPath: workspaceRoot,
                serverKey: 'buyi-SerenezZmuy',
                encoding: 'UTF8',
                loginKey: 'buyi-ZMuy',
                loginWithEmail: false,
                compile: {
                    defaultDir: '',
                    autoCompileOnSave: false,
                    timeout: 30000,
                    showDetails: true
                },
                connection: {
                    timeout: 10000,
                    maxRetries: 3,
                    retryInterval: 5000,
                    heartbeatInterval: 30000
                }
            };

            // 添加新配置
            await this._configManager.addProfile(profileId, newProfile);

            this._outputChannel.appendLine(`新配置已添加: ${profileName} (${profileId})`);
            logger.log(`新配置已添加: ${profileName} (${profileId})`, LogLevel.INFO);

            // 更新UI
            this.updateView();

            vscode.window.showInformationMessage(
                `新配置 "${profileName}" 已添加，请配置服务器信息后使用`
            );
        } catch (error) {
            this._outputChannel.appendLine(`添加配置失败: ${error}`);
            vscode.window.showErrorMessage(`添加配置失败: ${error}`);
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
                        case 'switchProfile':
                            this._outputChannel.appendLine(`切换配置环境: ${message.profileId}`);
                            await this.handleSwitchProfile(message.profileId);
                            break;
                        case 'addProfile':
                            this._outputChannel.appendLine('添加新配置');
                            await this.handleAddProfile();
                            break;
                        case 'addFavoriteFile':
                            this._outputChannel.appendLine('添加常用文件');
                            await this.addFavoriteCurrentFile();
                            break;
                        case 'openFavoriteFile':
                            this._outputChannel.appendLine(`打开常用文件: ${message.filePath}`);
                            await this.openFavoriteFile(message.filePath);
                            break;
                        case 'deleteFavoriteFile':
                            this._outputChannel.appendLine(`删除常用文件: index=${message.index}`);
                            await this.deleteFavoriteFile(message.index);
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

    public refreshViewState() {
        this.updateView();
    }

    /**
     * 🚀 获取当前配置信息 - 适配版本2格式
     */
    private getCurrentConfig() {
        try {
            const config = this._configManager.getConfigSnapshot();
            const activeProfile = config.profiles[config.activeProfile];
            if (activeProfile) {
                return {
                    ...activeProfile,
                    activeProfile: config.activeProfile,
                    profiles: config.profiles
                };
            }
        } catch (error) {
            console.error('Failed to get current config:', error);
        }
        return {
            rootPath: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '',
            activeProfile: 'default',
            profiles: {}
        };
    }

    private formatLocalCompilePathLabel(rawPath: string): string {
        if (!rawPath) {
            return '自动扫描';
        }

        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            return rawPath;
        }

        const resolvedPath = path.resolve(path.isAbsolute(rawPath) ? rawPath : path.join(workspaceRoot, rawPath));
        if (!fs.existsSync(resolvedPath)) {
            return `无效: ${rawPath}`;
        }

        const mudlibRoot = PathConverter.findMudProjectRootFromFile(resolvedPath);
        if (mudlibRoot) {
            return path.relative(mudlibRoot, resolvedPath).replace(/\\/g, '/');
        }

        const relativePath = path.relative(workspaceRoot, resolvedPath);
        if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
            return relativePath.replace(/\\/g, '/');
        }

        return rawPath;
    }

    private getLocalCompileUiState(): LocalCompileUiState {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const lpccPath = config.inspect<string>('localCompile.lpccPath')?.workspaceValue;
        const configPath = config.inspect<string>('localCompile.configPath')?.workspaceValue;
        const showWarnings = config.inspect<boolean>('localCompile.showWarnings')?.workspaceValue;
        const autoCompileOnSave = config.inspect<boolean>('localCompile.autoCompileOnSave')?.workspaceValue;
        const messageLanguage = normalizeCompilerDiagnosticMessageLanguage(
            config.get<string>('diagnostics.messageLanguage', 'dual')
        );

        return {
            lpccPathLabel: this.formatLocalCompilePathLabel(typeof lpccPath === 'string' ? lpccPath.trim() : ''),
            configPathLabel: this.formatLocalCompilePathLabel(typeof configPath === 'string' ? configPath.trim() : ''),
            showWarnings: showWarnings ?? true,
            autoCompileOnSave: autoCompileOnSave ?? false,
            messageLanguageLabel: describeCompilerDiagnosticMessageLanguage(messageLanguage)
        };
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
            this._outputChannel.appendLine('常用文件:');
            this._favoriteFiles.forEach(file => {
                this._outputChannel.appendLine(`- ${file.name}: ${file.path}`);
            });

            // 发送状态更新消息
            const config = this.getCurrentConfig();
            this._view.webview.postMessage({
                type: 'updateState',
                connected: this._isConnected,
                loggedIn: this._isLoggedIn,
                initialized: this._isInitialized,
                customCommands: this._customCommands,
                customEvals: this._customEvals,
                favoriteFiles: this._favoriteFiles,
                config: config,
                localCompile: this.getLocalCompileUiState(),
                profiles: config.profiles || {},
                activeProfileId: config.activeProfile || 'default'
            });
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const buttonStyle = `
            body {
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .button-row {
                display: flex;
                gap: 8px;
                width: 100%;
            }

            .button-row button {
                flex: 1;
                min-width: 0;
            }

            button {
                padding: 8px 12px;
                background: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 6px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-size: 12px;
                font-weight: 500;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                min-height: 32px;
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
                background: #2d2d30 !important;
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 8px;
                margin-top: 4px;
                overflow: hidden;
                padding: 4px;
                width: 100%;
                box-sizing: border-box;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                animation: dropdownFadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .dropdown-content:hover {
                background: #2d2d30 !important;
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
                background: #2d2d30 !important;
            }

            .dropdown-items-container:hover {
                background: #2d2d30 !important;
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
                padding: 6px 10px;
                gap: 6px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                box-sizing: border-box;
                background: transparent;
                border-radius: 4px;
                min-height: 30px;
                position: relative;
                color: var(--vscode-foreground);
            }

            .dropdown-item:hover {
                background: #3c3c3c !important;
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
                background: rgba(255, 255, 255, 0.1) !important;
            }

            .delete-button:hover {
                background: rgba(255, 0, 0, 0.1) !important;
            }

            .add-button {
                grid-column: 1 / -1;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 8px 14px;
                background: #2d2d30;
                color: var(--vscode-button-secondaryForeground);
                border: 1px dashed var(--vscode-button-border);
                margin: 4px 0;
                border-radius: 6px;
                min-height: 36px;
                cursor: pointer;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            }

            .add-button:hover {
                background: #3c3c3c !important;
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
            .config-panel {
                margin-top: 12px;
            }

            .config-display-toggle {
                width: 100%;
                display: flex;
                align-items: center;
                gap: 8px;
                background: color-mix(in srgb, var(--vscode-editor-background) 72%, transparent);
                color: var(--vscode-foreground);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                padding: 10px 12px;
                text-align: left;
            }

            .config-display-toggle:hover {
                background: color-mix(in srgb, var(--vscode-editor-background) 86%, transparent);
            }

            .config-display-toggle .config-toggle-meta {
                margin-left: auto;
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                opacity: 0.8;
            }

            .config-display-toggle .config-toggle-chevron {
                transition: transform 0.2s ease;
                opacity: 0.8;
            }

            .config-panel.open .config-display-toggle .config-toggle-chevron {
                transform: rotate(180deg);
            }

            .config-display {
                display: none;
                margin-top: 8px;
                padding: 12px;
                background: color-mix(in srgb, var(--vscode-editor-background) 60%, transparent);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
                font-size: 12px;
                backdrop-filter: blur(10px);
            }

            .config-panel.open .config-display {
                display: block;
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

            /* 🚀 配置环境选择器样式 */
            .profile-selector {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 12px;
                padding: 10px;
                background: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 8px;
            }

            .selector-label {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 12px;
                color: var(--vscode-descriptionForeground);
                font-weight: 500;
                white-space: nowrap;
            }

            .profile-dropdown {
                flex: 1;
                padding: 6px 10px;
                background: var(--vscode-dropdown-background);
                color: var(--vscode-foreground);
                border: 1px solid var(--vscode-dropdown-border);
                border-radius: 6px;
                font-size: 13px;
                font-weight: 500;
                cursor: pointer;
                outline: none;
                transition: all 0.2s;
            }

            .profile-dropdown:hover {
                background: var(--vscode-dropdown-listBackground);
                border-color: var(--vscode-focusBorder);
            }

            .profile-dropdown:focus {
                border-color: var(--vscode-focusBorder);
                box-shadow: 0 0 0 1px var(--vscode-focusBorder);
            }

            .profile-dropdown option {
                background: var(--vscode-dropdown-listBackground, var(--vscode-dropdown-background));
                color: var(--vscode-foreground);
            }

            .icon-button {
                padding: 6px 10px;
                background: var(--vscode-button-secondaryBackground);
                border: 1px solid var(--vscode-button-border);
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .icon-button:hover {
                background: var(--vscode-button-secondaryHoverBackground);
                transform: scale(1.1);
            }

            .icon-button:active {
                transform: scale(0.95);
            }

            /* 🚀 切换按钮样式 */
            .use-button {
                padding: 4px 12px;
                background: var(--vscode-button-secondaryBackground);
                color: var(--vscode-button-secondaryForeground);
                border: 1px solid var(--vscode-button-border);
                border-radius: 4px;
                cursor: pointer;
                font-size: 11px;
                font-weight: 500;
                transition: all 0.2s;
                white-space: nowrap;
            }

            .use-button:hover {
                background: var(--vscode-button-secondaryHoverBackground);
            }

            .use-button:active {
                transform: scale(0.95);
            }

            /* 🚀 当前配置高亮 */
            .config-value.current-profile {
                color: #FFA726 !important;
                font-weight: 600;
                font-size: 13px;
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

        const favoriteFilesHtml = this.generateFavoriteFilesHtml();

        return `<!DOCTYPE html>
            <html lang="zh-CN">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>${buttonStyle}</style>
            </head>
            <body>
                <div class="button-row">
                    <button id="localCompile" disabled>
                        <span class="button-icon">🏠</span>
                        <span>本地LPCC编译</span>
                    </button>
                    <button id="configureLocalCompile" disabled>
                        <span class="button-icon">⚙️</span>
                        <span>本地LPCC设置</span>
                    </button>
                </div>
                
                <div class="button-row">
                    <button id="generateAutoDeclarations" disabled>
                        <span class="button-icon">🧩</span>
                        <span>生成函数声明</span>
                    </button>
                    <button id="copyMudPath" disabled>
                        <span class="button-icon">📋</span>
                        <span>复制相对路径</span>
                    </button>
                </div>

                <div class="dropdown">
                    <button class="dropdown-button" id="favoriteFilesDropdown">
                        <span class="button-icon">⭐</span>
                        <span>常用文件</span>
                        <span style="margin-left: auto">▼</span>
                    </button>
                    <div class="dropdown-content" id="favoriteFilesList">
                        <div class="dropdown-items-container">
                            ${favoriteFilesHtml}
                            <button class="add-button" id="addFavoriteFile">
                                <span class="button-icon">➕</span>
                                <span>添加当前文件到常用</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div class="divider"></div>

                <div class="button-row">
                    <button id="compile" disabled>
                        <span class="button-icon">🔨</span>
                        <span>远程Update当前文件</span>
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
                </div>

                <button id="connect" class="${this._isConnected ? 'connected' : ''}">
                    <span class="button-icon">🔌</span>
                    <span>${this._isConnected ? '断开服务器' : '连接游戏服务器'}</span>
                </button>

                <!-- 🚀 配置环境选择器 -->
                <div class="profile-selector">
                    <label class="selector-label">
                        <span class="config-icon">⚙️</span>
                        <span>配置环境</span>
                    </label>
                    <select id="profile-select" class="profile-dropdown">
                        <!-- 动态生成 -->
                    </select>
                    <button id="use-profile" class="use-button">切换</button>
                </div>

                <!-- 🚀 配置显示区 -->
                <div class="config-panel" id="configPanel">
                    <button class="config-display-toggle" id="configDisplayToggle" type="button">
                        <span class="config-icon">🧭</span>
                        <span>当前配置</span>
                        <span class="config-toggle-meta" id="configDisplayToggleMeta">点击展开</span>
                        <span class="config-toggle-chevron">▼</span>
                    </button>
                    <div class="config-display">
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">🎯</span>
                            <span>服务端Update配置</span>
                        </div>
                        <div class="config-value current-profile" id="config-currentProfile">未配置</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">📁</span>
                            <span>服务端mudlib目录映射路径</span>
                        </div>
                        <div class="config-value" id="config-rootPath">未配置</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">🌐</span>
                            <span>服务端连接地址</span>
                        </div>
                        <div class="config-value" id="config-hostPort">未配置</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">📦</span>
                            <span>当前LPCC</span>
                        </div>
                        <div class="config-value" id="config-localLpcc">自动扫描</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">🧾</span>
                            <span>当前Config</span>
                        </div>
                        <div class="config-value" id="config-localConfig">自动扫描</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">💾</span>
                            <span>保存自动本地编译</span>
                        </div>
                        <div class="config-value" id="config-localAutoCompile">关闭</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">⚠️</span>
                            <span>警告提示</span>
                        </div>
                        <div class="config-value" id="config-localWarnings">开启</div>
                    </div>
                    <div class="config-item">
                        <div class="config-label">
                            <span class="config-icon">🌏</span>
                            <span>诊断语言</span>
                        </div>
                        <div class="config-value" id="config-diagnosticLanguage">中英双语</div>
                    </div>
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
                            favoriteFiles: ${JSON.stringify(this._favoriteFiles)},
                            config: ${JSON.stringify(this.getCurrentConfig())},
                            localCompile: ${JSON.stringify(this.getLocalCompileUiState())},
                            profiles: ${JSON.stringify(this.getCurrentConfig().profiles || {})},
                            activeProfileId: '${this.getCurrentConfig().activeProfile || 'default'}'
                        };

                        const configPanel = document.getElementById('configPanel');
                        const configDisplayToggle = document.getElementById('configDisplayToggle');
                        const configDisplayToggleMeta = document.getElementById('configDisplayToggleMeta');

                        function setConfigPanelExpanded(expanded) {
                            if (!configPanel) return;
                            configPanel.classList.toggle('open', expanded);
                            if (configDisplayToggleMeta) {
                                configDisplayToggleMeta.textContent = expanded ? '点击收起' : '点击展开';
                            }
                        }

                        configDisplayToggle?.addEventListener('click', () => {
                            const expanded = !configPanel?.classList.contains('open');
                            setConfigPanelExpanded(expanded);
                        });

                        setConfigPanelExpanded(false);

                        // 命令映射
                        const commands = {
                            'connect': 'game-server-compiler.connect',
                            'compile': 'game-server-compiler.compileCurrentFile',
                            'localCompile': 'game-server-compiler.localCompileCurrentFile',
                            'configureLocalCompile': 'game-server-compiler.configureLocalCompile',
                            'compileDir': 'game-server-compiler.compileDir',
                            'copyMudPath': 'game-server-compiler.copyMudPath',
                            'generateAutoDeclarations': 'game-server-compiler.generateAutoDeclarations',
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
                        ['customCommandsDropdown', 'customEvalsDropdown', 'favoriteFilesDropdown'].forEach(id => {
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
                        document.getElementById('addFavoriteFile')?.addEventListener('click', () => {
                            vscode.postMessage({
                                type: 'addFavoriteFile'
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

                        function bindFavoriteFileEvents(container) {
                            container.querySelectorAll('.dropdown-item').forEach(item => {
                                item.addEventListener('click', (e) => {
                                    if (!e.target.classList.contains('delete-favorite-button')) {
                                        const filePath = item.dataset.filePath;
                                        if (filePath) {
                                            vscode.postMessage({
                                                type: 'openFavoriteFile',
                                                filePath: filePath
                                            });
                                        }
                                    }
                                });
                            });

                            container.querySelectorAll('.delete-favorite-button').forEach(button => {
                                button.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    const index = parseInt(button.dataset.index);
                                    vscode.postMessage({
                                        type: 'deleteFavoriteFile',
                                        index: index
                                    });
                                });
                            });
                        }

                        // 初始化时绑定事件
                        const commandsList = document.getElementById('customCommandsList');
                        const evalsList = document.getElementById('customEvalsList');
                        const favoritesList = document.getElementById('favoriteFilesList');
                        if (commandsList) {
                            const container = commandsList.querySelector('.dropdown-items-container');
                            if (container) bindCustomCommandEvents(container, false);
                        }
                        if (evalsList) {
                            const container = evalsList.querySelector('.dropdown-items-container');
                            if (container) bindCustomCommandEvents(container, true);
                        }
                        if (favoritesList) {
                            const container = favoritesList.querySelector('.dropdown-items-container');
                            if (container) bindFavoriteFileEvents(container);
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

                        // 🚀 配置选择器初始化
                        const profileSelect = document.getElementById('profile-select');
                        if (profileSelect) {
                            profileSelect.addEventListener('change', (e) => {
                                const value = e.target.value;
                                if (value === '__add_new__') {
                                    // 添加新配置
                                    console.log('添加新配置');
                                    vscode.postMessage({ type: 'addProfile' });
                                    // 重置回当前配置
                                    e.target.value = state.activeProfileId;
                                } else {
                                    console.log('选中配置:', value);
                                }
                            });
                        }

                        // 🚀 使用选中的配置
                        document.getElementById('use-profile')?.addEventListener('click', () => {
                            const select = document.getElementById('profile-select');
                            if (select && select.value !== '__add_new__') {
                                const profileId = select.value;
                                console.log('使用配置:', profileId);
                                vscode.postMessage({
                                    type: 'switchProfile',
                                    profileId: profileId
                                });
                            }
                        });

                        // 🚀 更新配置选择器
                        function updateProfileSelector() {
                            const select = document.getElementById('profile-select');
                            if (!select) return;

                            select.innerHTML = '';

                            Object.entries(state.profiles).forEach(([id, profile]) => {
                                const option = document.createElement('option');
                                option.value = id;
                                option.textContent = profile.name || id;
                                option.selected = id === state.activeProfileId;
                                select.appendChild(option);
                            });

                            // 🚀 添加"添加新配置"选项
                            const addOption = document.createElement('option');
                            addOption.value = '__add_new__';
                            addOption.textContent = '➕ 添加新配置...';
                            select.appendChild(addOption);

                            console.log('配置选择器已更新，当前配置:', state.activeProfileId);
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
                                    } else if (
                                        id === 'copyMudPath' ||
                                        id === 'generateAutoDeclarations' ||
                                        id === 'localCompile' ||
                                        id === 'configureLocalCompile'
                                    ) {
                                        button.disabled = !state.initialized;
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
                            const favoriteDropdown = document.getElementById('favoriteFilesDropdown');
                            if (favoriteDropdown) {
                                favoriteDropdown.disabled = !state.initialized;
                            }

                            // 🚀 更新配置选择器和显示
                            updateProfileSelector();
                            updateConfigDisplay();
                        }

                        // 更新配置显示
                        function updateConfigDisplay() {
                            const rootPathEl = document.getElementById('config-rootPath');
                            const hostPortEl = document.getElementById('config-hostPort');
                            const currentProfileEl = document.getElementById('config-currentProfile');
                            const localLpccEl = document.getElementById('config-localLpcc');
                            const localConfigEl = document.getElementById('config-localConfig');
                            const localAutoCompileEl = document.getElementById('config-localAutoCompile');
                            const localWarningsEl = document.getElementById('config-localWarnings');
                            const diagnosticLanguageEl = document.getElementById('config-diagnosticLanguage');

                            // 🚀 从当前激活的配置中获取信息
                            const activeProfile = state.profiles && state.profiles[state.activeProfileId];
                            const config = activeProfile || state.config;

                            // 🚀 更新当前配置名称
                            if (currentProfileEl) {
                                if (activeProfile && activeProfile.name) {
                                    currentProfileEl.textContent = activeProfile.name;
                                    currentProfileEl.classList.remove('empty');
                                } else {
                                    currentProfileEl.textContent = '未配置';
                                    currentProfileEl.classList.add('empty');
                                }
                            }

                            if (rootPathEl) {
                                if (config && config.rootPath) {
                                    rootPathEl.textContent = config.rootPath;
                                    rootPathEl.classList.remove('empty');
                                } else {
                                    rootPathEl.textContent = '未配置';
                                    rootPathEl.classList.add('empty');
                                }
                            }

                            if (hostPortEl) {
                                if (config && config.host && config.port) {
                                    hostPortEl.textContent = config.host + ':' + config.port;
                                    hostPortEl.classList.remove('empty');
                                } else {
                                    hostPortEl.textContent = '未配置';
                                    hostPortEl.classList.add('empty');
                                }
                            }

                            if (localLpccEl) {
                                const lpccPathLabel = state.localCompile?.lpccPathLabel || '自动扫描';
                                localLpccEl.textContent = lpccPathLabel;
                                localLpccEl.classList.toggle('empty', lpccPathLabel === '自动扫描');
                            }

                            if (localConfigEl) {
                                const configPathLabel = state.localCompile?.configPathLabel || '自动扫描';
                                localConfigEl.textContent = configPathLabel;
                                localConfigEl.classList.toggle('empty', configPathLabel === '自动扫描');
                            }

                            if (localAutoCompileEl) {
                                localAutoCompileEl.textContent = state.localCompile?.autoCompileOnSave ? '开启' : '关闭';
                                localAutoCompileEl.classList.remove('empty');
                            }

                            if (localWarningsEl) {
                                localWarningsEl.textContent = state.localCompile?.showWarnings ? '开启' : '关闭';
                                localWarningsEl.classList.remove('empty');
                            }
                            if (diagnosticLanguageEl) {
                                diagnosticLanguageEl.textContent =
                                    state.localCompile?.messageLanguageLabel || '中英双语';
                                diagnosticLanguageEl.classList.remove('empty');
                            }
                        }

                        // 初始化时更新按钮状态和配置选择器
                        updateButtons();
                        updateProfileSelector();

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
                                case 'updateFavoriteFiles':
                                    const favoriteContainer = document.querySelector('#favoriteFilesList .dropdown-items-container');
                                    if (favoriteContainer) {
                                        const addButton = favoriteContainer.querySelector('#addFavoriteFile');
                                        favoriteContainer.innerHTML = message.html;
                                        if (addButton) {
                                            favoriteContainer.appendChild(addButton);
                                        } else {
                                            const button = document.createElement('button');
                                            button.className = 'add-button';
                                            button.id = 'addFavoriteFile';
                                            button.innerHTML = '<span class="button-icon">➕</span><span>添加当前文件到常用</span>';
                                            favoriteContainer.appendChild(button);
                                            button.addEventListener('click', () => {
                                                vscode.postMessage({ type: 'addFavoriteFile' });
                                            });
                                        }
                                        bindFavoriteFileEvents(favoriteContainer);
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
