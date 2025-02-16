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
            return JSON.parse(configData);
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
        serverKey: ''
    };
}

// 保存配置文件
async function saveConfig(config: Partial<Config>): Promise<void> {
    try {
        const currentConfig = readConfig();
        const newConfig = { ...currentConfig, ...config };
        ensureDirectoryExists(path.dirname(configPath));
        fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
        
        // 同步更新VS Code设置
        const vsConfig = vscode.workspace.getConfiguration('gameServerCompiler');
        for (const [key, value] of Object.entries(newConfig)) {
            if (value !== undefined) {
                await vsConfig.update(key, value, true);
            }
        }
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

export async function activate(context: vscode.ExtensionContext) {
    console.log('正在激活插件...');
    
    // 创建视图提供者
    messageProvider = new MessageProvider(context.extensionUri);
    buttonProvider = new ButtonProvider(context.extensionUri);

    // 注册视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('game-server-messages', messageProvider, {
            webviewOptions: {
                retainContextWhenHidden: true  // 保持WebView上下文
            }
        }),
        vscode.window.registerWebviewViewProvider('game-server-buttons', buttonProvider, {
            webviewOptions: {
                retainContextWhenHidden: true  // 保持WebView上下文
            }
        })
    );

    // 创建TcpClient实例
    tcpClient = new TcpClient({
        appendLine: (line: string) => messageProvider?.addMessage(line),
        show: () => {}
    }, buttonProvider);

    // 初始化配置
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            throw new Error('未找到工作区目录');
        }

        configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
        ensureDirectoryExists(path.dirname(configPath));
        
        if (!fs.existsSync(configPath)) {
            await saveConfig({
                host: '',
                port: 0,
                username: '',
                password: '',
                rootPath: workspaceRoot,
                serverKey: 'buyi-SerenezZmuy'
            });
        }

        // 读取配置
        const config = readConfig();
        // 确保serverKey存在
        if (!config.serverKey) {
            await saveConfig({
                ...config,
                serverKey: 'buyi-SerenezZmuy'
            });
        }
        messageProvider.addMessage('插件初始化完成');
    } catch (error) {
        console.error('插件初始化错误:', error);
        vscode.window.showErrorMessage(`插件初始化失败: ${error}`);
    }

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
                messageProvider?.addMessage('服务器连接成功');
            } catch (error) {
                messageProvider?.addMessage('连接失败');
                vscode.window.showErrorMessage('连接失败');
            }
        },
        'game-server-compiler.compileCurrentFile': async () => {
            if (!tcpClient.isConnected()) {
                vscode.window.showErrorMessage('请先连接服务器');
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
                vscode.window.showErrorMessage('编译文件失败');
            }
        },
        'game-server-compiler.compileDir': async () => {
            if (!tcpClient.isConnected()) {
                vscode.window.showErrorMessage('请先连接服务器');
                return;
            }

            const path = await vscode.window.showInputBox({
                prompt: '输入要编译的目录路径',
                placeHolder: '例如: /cmds',
                ignoreFocusOut: true
            });

            if (path) {
                try {
                    tcpClient.sendCustomCommand(`updateall ${path}`);
                    messageProvider?.addMessage(`发送编译目录命令: updateall ${path}`);
                } catch (error) {
                    messageProvider?.addMessage(`发送编译目录命令失败: ${error}`);
                    vscode.window.showErrorMessage(`发送编译目录命令失败: ${error}`);
                }
            }
        },
        'game-server-compiler.sendCommand': async () => {
            if (!tcpClient.isConnected()) {
                vscode.window.showErrorMessage('请先连接服务器');
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
            if (!tcpClient.isConnected()) {
                vscode.window.showErrorMessage('请先连接服务器');
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
