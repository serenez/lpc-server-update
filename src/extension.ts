import * as vscode from 'vscode';
import { TcpClient } from './tcpClient';
import { MessageProvider } from './messageProvider';
import { ButtonProvider } from './buttonProvider';
import * as fs from 'fs';
import * as path from 'path';

let tcpClient: TcpClient;
let messageProvider: MessageProvider;
let buttonProvider: ButtonProvider;
let configPath: string;

interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
}

// 确保目录存在
function ensureDirectoryExists(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

// 读取配置文件
function readConfig(): Config {
    try {
        if (fs.existsSync(configPath)) {
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);
            
            // 确保所有必需字段都存在
            return {
                host: config.host || '',
                port: config.port || 0,
                username: config.username || '',
                password: config.password || '',
                rootPath: config.rootPath || path.dirname(configPath),
                serverKey: config.serverKey || '',
                compile: {
                    defaultDir: config.compile?.defaultDir || '',
                    autoCompileOnSave: config.compile?.autoCompileOnSave || false,
                    timeout: config.compile?.timeout || 30000,
                    showDetails: config.compile?.showDetails || true
                }
            };
        }
    } catch (error) {
        console.error('读取配置文件失败:', error);
    }
    return {
        host: '',
        port: 0,
        username: '',
        password: '',
        rootPath: path.dirname(configPath),
        serverKey: '',
        compile: {
            defaultDir: '',
            autoCompileOnSave: false,
            timeout: 30000,
            showDetails: true
        }
    };
}

// 保存配置文件
async function saveConfig(config: Partial<Config>): Promise<void> {
    try {
        const currentConfig = readConfig();
        const newConfig = { ...currentConfig, ...config };
        ensureDirectoryExists(path.dirname(configPath));
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        messageProvider?.addMessage('配置已保存到muy-lpc-update.json');
    } catch (error) {
        console.error('保存配置文件失败:', error);
        throw error;
    }
}

// 检查并更新服务器配置
async function checkAndUpdateServerConfig(): Promise<boolean> {
    const config = readConfig();
    
    // 如果已有完整的服务器配置，直接返回
    if (config.host && config.port) {
        messageProvider?.addMessage('服务器配置已存在');
        return true;
    }

    // 检查服务器配置
    const host = await vscode.window.showInputBox({
        prompt: '请输入服务器地址',
        placeHolder: 'localhost',
        value: config.host || 'localhost'
    });
    if (!host) return false;

    const portStr = await vscode.window.showInputBox({
        prompt: '请输入服务器端口',
        placeHolder: '8080',
        value: config.port?.toString() || '8080'
    });
    if (!portStr) return false;
    
    const port = parseInt(portStr);
    if (isNaN(port)) {
        vscode.window.showErrorMessage('端口必须是数字');
        return false;
    }

    await saveConfig({ host, port });
    vscode.window.showInformationMessage('服务器配置已保存');
    return true;
}

// 检查并更新用户配置
async function checkAndUpdateUserConfig(): Promise<boolean> {
    const config = readConfig();
    
    // 如果已有完整的用户配置，直接返回
    if (config.username && config.password) {
        messageProvider?.addMessage('用户配置已存在');
        return true;
    }

    // 检查用户名和密码
    const username = await vscode.window.showInputBox({
        prompt: '请输入巫师账号',
        placeHolder: 'username',
        value: config.username
    });
    if (!username) return false;

    const password = await vscode.window.showInputBox({
        prompt: '请输入密码',
        placeHolder: 'password',
        value: config.password
    });
    if (!password) return false;

    await saveConfig({ username, password });
    vscode.window.showInformationMessage('用户配置已保存');
    return true;
}

async function checkAndUpdateConfig(): Promise<boolean> {
    const config = readConfig();
    
    // 检查是否需要配置
    const needsServerConfig = !config.host || !config.port;
    const needsUserConfig = !config.username || !config.password;
    
    // 如果配置完整，直接返回
    if (!needsServerConfig && !needsUserConfig) {
        messageProvider?.addMessage('配置已完整，无需更新');
        return true;
    }
    
    // 需要服务器配置时才检查
    if (needsServerConfig) {
        if (!await checkAndUpdateServerConfig()) {
            return false;
        }
    }
    
    // 需要用户配置时才检查
    if (needsUserConfig) {
        if (!await checkAndUpdateUserConfig()) {
            return false;
        }
    }

    return true;
}

// 修改路径转换方法
function convertToMudPath(fullPath: string): string {
    const config = readConfig();
    
    try {
        // 计算相对路径
        let relativePath = path.relative(config.rootPath, fullPath);
        
        // 将路径分隔符统一为 /
        relativePath = relativePath.replace(/\\/g, '/');
        
        // 如果不是以/开头，添加/
        if (!relativePath.startsWith('/')) {
            relativePath = '/' + relativePath;
        }
        
        // 移除文件扩展名
        relativePath = relativePath.replace(/\.[^/.]+$/, "");
        
        return relativePath;
    } catch (error) {
        throw new Error('路径转换失败');
    }
}

// 初始化配置文件
async function initializeConfig() {
    try {
        // 获取工作区根目录
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            throw new Error('未找到工作区目录');
        }

        // 设置配置文件路径
        const vscodeDir = path.join(workspaceRoot, '.vscode');
        configPath = path.join(vscodeDir, 'muy-lpc-update.json');

        // 确保.vscode目录存在
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
            messageProvider?.addMessage('创建.vscode目录');
        }

        // 检查配置文件是否存在
        if (!fs.existsSync(configPath)) {
            // 创建默认配置
            const defaultConfig = {
                host: '',
                port: 0,
                username: '',
                password: '',
                rootPath: workspaceRoot,
                serverKey: 'buyi-SerenezZmuy',
                compile: {
                    defaultDir: '',
                    autoCompileOnSave: false,
                    timeout: 30000,
                    showDetails: true
                }
            };

            // 写入配置文件
            fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
            messageProvider?.addMessage('创建默认配置文件');

            // 显示欢迎信息
            vscode.window.showInformationMessage('LPC服务器连接器已初始化，请在.vscode/muy-lpc-update.json中配置服务器信息。');
        } else {
            // 读取现有配置
            const config = readConfig();
            
            // 检查配置完整性
            const missingFields = [];
            if (!config.host) missingFields.push('host');
            if (!config.port) missingFields.push('port');
            if (!config.username) missingFields.push('username');
            if (!config.password) missingFields.push('password');
            if (!config.rootPath) missingFields.push('rootPath');
            if (!config.serverKey) missingFields.push('serverKey');

            // 如果有缺失字段，更新配置
            if (missingFields.length > 0) {
                const updatedConfig = {
                    ...config,
                    host: config.host || '',
                    port: config.port || 0,
                    username: config.username || '',
                    password: config.password || '',
                    rootPath: config.rootPath || workspaceRoot,
                    serverKey: config.serverKey || 'buyi-SerenezZmuy',
                    compile: {
                        defaultDir: config.compile?.defaultDir || '',
                        autoCompileOnSave: config.compile?.autoCompileOnSave || false,
                        timeout: config.compile?.timeout || 30000,
                        showDetails: config.compile?.showDetails || true
                    }
                };

                // 写入更新后的配置
                fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
                messageProvider?.addMessage('更新配置文件结构');

                // 提示用户
                vscode.window.showInformationMessage(`配置文件已更新，请补充以下信息: ${missingFields.join(', ')}`);
            }
        }

        messageProvider?.addMessage('配置文件初始化完成');
        return true;
    } catch (error) {
        const errorMessage = `配置文件初始化失败: ${error}`;
        messageProvider?.addMessage(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        return false;
    }
}

export async function activate(context: vscode.ExtensionContext) {
    // 创建两个独立的输出通道
    const outputChannel = vscode.window.createOutputChannel('LPC服务器调试');
    const serverLogChannel = vscode.window.createOutputChannel('LPC服务器日志');
    
    // 确保面板显示
    outputChannel.show(true);
    
    // 创建视图提供者
    messageProvider = new MessageProvider(context.extensionUri);
    buttonProvider = new ButtonProvider(context.extensionUri);

    // 输出初始化日志
    outputChannel.appendLine('========== LPC服务器连接器初始化 ==========');
    outputChannel.appendLine(`时间: ${new Date().toLocaleString()}`);
    outputChannel.appendLine(`工作区: ${vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '未知'}`);
    outputChannel.appendLine('==========================================');
    
    messageProvider.addMessage('正在初始化插件...');

    // 注册视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('game-server-messages', messageProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }),
        vscode.window.registerWebviewViewProvider('game-server-buttons', buttonProvider, {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        })
    );

    // 创建TcpClient实例，传入两个不同的输出通道
    tcpClient = new TcpClient({
        debug: {
            appendLine: (line: string) => outputChannel.appendLine(line),
            show: () => outputChannel.show(false)
        },
        server: {
            appendLine: (line: string) => {
                serverLogChannel.appendLine(line);
                messageProvider?.addMessage(line);
            },
            show: () => serverLogChannel.show(false)
        }
    }, buttonProvider);

    // 初始化配置
    if (!await initializeConfig()) {
        outputChannel.appendLine('插件初始化失败');
        messageProvider.addMessage('插件初始化失败');
        return;
    }

    outputChannel.appendLine('插件初始化完成');
    messageProvider.addMessage('插件初始化完成');
    
    // 将输出面板添加到订阅中
    context.subscriptions.push(outputChannel);

    // 注册命令
    const commands = {
        'game-server-compiler.connect': async () => {
            try {
                if (tcpClient.isConnected()) {
                    const disconnect = await vscode.window.showQuickPick(['是', '否'], {
                        placeHolder: '服务器已连接，是否断开连接？'
                    });
                    if (disconnect === '是') {
                        tcpClient.disconnect();
                        messageProvider?.addMessage('已断开服务器连接');
                    }
                    return;
                }

                if (!await checkAndUpdateConfig()) {
                    return;
                }

                const config = readConfig();
                messageProvider?.addMessage('正在连接服务器...');
                await tcpClient.connect(config.host, config.port);
                
                // 等待登录结果
                const loginTimeout = 10000; // 10秒登录超时
                const startTime = Date.now();
                
                while (Date.now() - startTime < loginTimeout) {
                    if (tcpClient.isLoggedIn()) {
                        messageProvider?.addMessage('角色登录成功');
                        // 更新登录状态上下文
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', true);
                        return;
                    }
                    if (!tcpClient.isConnected()) {
                        throw new Error('连接已断开');
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
                
                // 登录超时，直接断开连接
                messageProvider?.addMessage('登录超时，请重新连接');
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
                tcpClient.disconnect();
                
            } catch (error) {
                const errorMsg = `${error}`;
                messageProvider?.addMessage(errorMsg);
                vscode.window.showErrorMessage(errorMsg);
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
            }
        },
        'game-server-compiler.compileCurrentFile': async () => {
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('没有打开的文件');
                return;
            }

            try {
                const filePath = editor.document.uri.fsPath;
                const mudPath = convertToMudPath(filePath);
                tcpClient.sendUpdateCommand(mudPath);
                messageProvider?.addMessage(`正在编译文件: ${mudPath}`);
            } catch (error) {
                messageProvider?.addMessage(`编译文件失败: ${error}`);
                vscode.window.showErrorMessage('编译文件失败');
            }
        },
        'game-server-compiler.compileDir': async () => {
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const config = readConfig();
            
            const path = await vscode.window.showInputBox({
                prompt: '输入要编译的目录路径',
                placeHolder: '例如: /cmds',
                value: config.compile.defaultDir,
                ignoreFocusOut: true
            });

            if (path) {
                try {
                    // 如果是新的目录路径,保存为默认值
                    if (path !== config.compile.defaultDir) {
                        await saveConfig({ 
                            compile: { 
                                ...config.compile, 
                                defaultDir: path 
                            } 
                        });
                    }

                    if (config.compile.showDetails) {
                        messageProvider?.addMessage(`开始编译目录: ${path}`);
                    }

                    // 设置编译超时
                    const timeout = config.compile.timeout;
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('编译超时')), timeout);
                    });

                    // 执行编译命令
                    const compilePromise = new Promise<void>((resolve, reject) => {
                        try {
                            tcpClient.sendCustomCommand(`updateall ${path}`);
                            if (config.compile.showDetails) {
                                messageProvider?.addMessage(`发送编译目录命令: updateall ${path}`);
                            }
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });

                    // 使用Promise.race来处理超时
                    await Promise.race([compilePromise, timeoutPromise]);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    messageProvider?.addMessage(`编译目录失败: ${errorMessage}`);
                    vscode.window.showErrorMessage(`编译目录失败: ${errorMessage}`);
                }
            }
        },
        'game-server-compiler.sendCommand': async () => {
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const command = await vscode.window.showInputBox({
                prompt: '输入要发送的命令',
                placeHolder: '例如: update /path/to/file',
                ignoreFocusOut: true
            });

            if (command) {
                try {
                    tcpClient.sendCustomCommand(command);
                    messageProvider?.addMessage(`发送命令: ${command}`);
                } catch (error) {
                    messageProvider?.addMessage(`发送命令失败: ${error}`);
                    vscode.window.showErrorMessage(`发送命令失败: ${error}`);
                }
            }
        },
        'game-server-compiler.restart': async () => {
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                '确定要重启服务器吗？',
                { modal: true },
                '确定',
                '取消'
            );
            
            if (confirm === '确定') {
                try {
                    tcpClient.sendRestartCommand();
                    messageProvider?.addMessage('已发送重启命令');
                    vscode.window.showInformationMessage('已发送重启命令');
                } catch (error) {
                    messageProvider?.addMessage(`发送重启命令失败: ${error}`);
                    vscode.window.showErrorMessage(`发送重启命令失败: ${error}`);
                }
            }
        }
    };

    // 注册所有命令
    Object.entries(commands).forEach(([commandId, handler]) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(commandId, handler)
        );
    });

    // 注册文件保存监听
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = readConfig();
            
            if (config.compile.autoCompileOnSave && tcpClient.isConnected() && tcpClient.isLoggedIn()) {
                // 检查文件是否是.c或.h文件
                if (document.fileName.endsWith('.c') || document.fileName.endsWith('.h')) {
                    try {
                        const filePath = document.uri.fsPath;
                        const mudPath = convertToMudPath(filePath);
                        messageProvider?.addMessage(`自动编译文件: ${mudPath}`);
                        tcpClient.sendUpdateCommand(mudPath);
                    } catch (error) {
                        messageProvider?.addMessage(`自动编译失败: ${error}`);
                    }
                }
            }
        })
    );
}

export function deactivate() {
    console.log('停用插件...');
    try {
        if (tcpClient?.isConnected()) {
            tcpClient.disconnect();
        }
        messageProvider?.dispose();
        console.log('插件停用完成');
    } catch (error) {
        console.error('插件停用错误:', error);
    }
} 
