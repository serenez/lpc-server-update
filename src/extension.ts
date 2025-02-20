import * as vscode from 'vscode';
import { TcpClient } from './tcpClient';
import { MessageProvider } from './messageProvider';
import { ButtonProvider } from './buttonProvider';
import * as path from 'path';
import { LogManager } from './log/LogManager';
import { ConfigManager } from './config/ConfigManager';

let tcpClient: TcpClient;
let messageProvider: MessageProvider;
let buttonProvider: ButtonProvider;
let configManager: ConfigManager;

interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    encoding: string;
    loginKey: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
    loginWithEmail?: boolean;
}

// 修改路径转换方法
function convertToMudPath(fullPath: string): string {
    const config = configManager.getConfig();
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

// 检查文件是否可编译
function isCompilableFile(filePath: string): boolean {
    return filePath.endsWith('.c') || filePath.endsWith('.lpc');
}

// 检查并更新服务器配置
async function checkAndUpdateServerConfig(): Promise<boolean> {
    const config = configManager.getConfig();
    
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

    await configManager.updateConfig({ host, port });
    vscode.window.showInformationMessage('服务器配置已保存');
    return true;
}

// 检查并更新用户配置
async function checkAndUpdateUserConfig(): Promise<boolean> {
    const config = configManager.getConfig();
    
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

    await configManager.updateConfig({ username, password });
    vscode.window.showInformationMessage('用户配置已保存');
    return true;
}

async function checkAndUpdateConfig(): Promise<boolean> {
    const config = configManager.getConfig();
    
    // 检查是否需要配置
    const needsServerConfig = !config.host || !config.port;
    const needsUserConfig = !config.username || !config.password;
    const needsLoginWithEmail = config.loginWithEmail === undefined;
    
    // 如果配置完整，直接返回
    if (!needsServerConfig && !needsUserConfig && !needsLoginWithEmail) {
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

    // 检查loginWithEmail配置
    if (needsLoginWithEmail) {
        const choice = await vscode.window.showQuickPick(['是', '否'], {
            placeHolder: '是否在登录信息中包含邮箱?'
        });
        
        if (choice === undefined) {
            return false;
        }

        await configManager.updateConfig({ loginWithEmail: choice === '是' });
        messageProvider?.addMessage(`已设置登录信息${choice === '是' ? '包含' : '不包含'}邮箱`);
    }

    return true;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('插件初始化...');
    
    // 创建输出通道
    const outputChannel = vscode.window.createOutputChannel('LPC服务器');
    // 自动显示输出面板
    outputChannel.show(true);
    // 初始化日志管理器
    LogManager.initialize(outputChannel);

    // 输出初始化日志
    outputChannel.appendLine('========== LPC服务器连接器初始化 ==========');
    outputChannel.appendLine(`时间: ${new Date().toLocaleString()}`);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    outputChannel.appendLine(`工作区: ${workspaceRoot || '未知'}`);
    outputChannel.appendLine('==========================================');

    // 创建视图提供者
    messageProvider = new MessageProvider(context.extensionUri);
    buttonProvider = new ButtonProvider(context.extensionUri, messageProvider);
    
    messageProvider.addMessage('正在初始化插件...');
    
    // 注册视图提供者
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('game-server-messages', messageProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        }),
        vscode.window.registerWebviewViewProvider('game-server-buttons', buttonProvider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // 初始化配置管理器
    try {
        configManager = ConfigManager.getInstance();
    } catch (error) {
        outputChannel.appendLine(`配置初始化失败: ${error}`);
        messageProvider.addMessage(`配置初始化失败: ${error}`);
        return;
    }

    // 创建TcpClient实例
    tcpClient = new TcpClient(outputChannel, buttonProvider, messageProvider);

    // 注册所有命令
    const commands = {
        'game-server-compiler.connect': async () => {
            outputChannel.appendLine('==== 执行连接命令 ====');
            try {
                outputChannel.appendLine(`当前连接状态: ${tcpClient.isConnected()}`);
                outputChannel.appendLine(`当前登录状态: ${tcpClient.isLoggedIn()}`);
                
                if (tcpClient.isConnected()) {
                    const disconnect = await vscode.window.showQuickPick(['是', '否'], {
                        placeHolder: '服务器已连接，是否断开连接？'
                    });
                    if (disconnect === '是') {
                        outputChannel.appendLine('用户选择断开连接');
                        tcpClient.disconnect();
                        messageProvider?.addMessage('已断开服务器连接');
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isConnected', false);
                        await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
                    }
                    return;
                }

                outputChannel.appendLine('检查配置...');
                if (!await checkAndUpdateConfig()) {
                    outputChannel.appendLine('配置检查失败');
                    return;
                }

                const config = configManager.getConfig();
                outputChannel.appendLine(`准备连接到服务器: ${config.host}:${config.port}`);
                messageProvider?.addMessage('正在连接服务器...');
                await tcpClient.connect(config.host, config.port);
                outputChannel.appendLine('连接命令已发送');

                // 等待登录结果
                const loginTimeout = 10000; // 10秒登录超时
                const startTime = Date.now();
                while (Date.now() - startTime < loginTimeout) {
                    if (tcpClient.isLoggedIn()) {
                        outputChannel.appendLine('登录成功');
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
                outputChannel.appendLine('登录超时');
                messageProvider?.addMessage('登录超时，请重新连接');
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
                tcpClient.disconnect();
            } catch (error) {
                outputChannel.appendLine(`连接错误: ${error}`);
                const errorMsg = `${error}`;
                messageProvider?.addMessage(errorMsg);
                vscode.window.showErrorMessage(errorMsg);
                await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', false);
            }
        },
        'game-server-compiler.compileCurrentFile': async () => {
            outputChannel.appendLine('==== 执行编译当前文件命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage('没有打开的文件');
                return;
            }

            const filePath = editor.document.uri.fsPath;
            if (!isCompilableFile(filePath)) {
                vscode.window.showErrorMessage('只能编译.c或.lpc文件');
                return;
            }

            try {
                outputChannel.appendLine(`原始文件路径: ${filePath}`);
                const mudPath = convertToMudPath(filePath);
                outputChannel.appendLine(`转换后的MUD路径: ${mudPath}`);
                tcpClient.sendUpdateCommand(mudPath);
                messageProvider?.addMessage(`正在编译文件: ${mudPath}`);
            } catch (error) {
                outputChannel.appendLine(`编译文件失败: ${error}`);
                messageProvider?.addMessage(`编译文件失败: ${error}`);
                vscode.window.showErrorMessage('编译文件失败');
            }
        },
        'game-server-compiler.compileDir': async () => {
            outputChannel.appendLine('==== 执行编译目录命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            const config = configManager.getConfig();
            const path = await vscode.window.showInputBox({
                prompt: '输入要编译的目录路径',
                placeHolder: '例如: /cmds',
                value: config.compile.defaultDir,
                ignoreFocusOut: true
            });

            if (path) {
                try {
                    outputChannel.appendLine(`编译目录: ${path}`);
                    // 如果是新的目录路径,保存为默认值
                    if (path !== config.compile.defaultDir) {
                        await configManager.updateConfig({
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
                    outputChannel.appendLine(`编译目录失败: ${errorMessage}`);
                    messageProvider?.addMessage(`编译目录失败: ${errorMessage}`);
                    vscode.window.showErrorMessage(`编译目录失败: ${errorMessage}`);
                }
            }
        },
        'game-server-compiler.sendCommand': async (command: string) => {
            outputChannel.appendLine('==== 执行发送命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            try {
                // 如果传入了command参数,直接执行
                if (command) {
                    outputChannel.appendLine(`发送命令: ${command}`);
                    tcpClient.sendCustomCommand(command);
                    messageProvider?.addMessage(`发送命令: ${command}`);
                    return;
                }

                // 否则弹出输入框
                const inputCommand = await vscode.window.showInputBox({
                    prompt: '输入要发送的命令',
                    placeHolder: '例如: update /path/to/file',
                    ignoreFocusOut: true
                });

                if (inputCommand) {
                    outputChannel.appendLine(`发送命令: ${inputCommand}`);
                    tcpClient.sendCustomCommand(inputCommand);
                    messageProvider?.addMessage(`发送命令: ${inputCommand}`);
                }
            } catch (error) {
                outputChannel.appendLine(`发送命令失败: ${error}`);
                messageProvider?.addMessage(`发送命令失败: ${error}`);
                vscode.window.showErrorMessage(`发送命令失败: ${error}`);
            }
        },
        'game-server-compiler.eval': async (code: string) => {
            outputChannel.appendLine('==== 执行Eval命令 ====');
            if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
                vscode.window.showErrorMessage('请先连接服务器并确保角色已登录');
                return;
            }

            try {
                // 如果传入了code参数,直接执行
                if (code) {
                    outputChannel.appendLine(`执行Eval: ${code}`);
                    tcpClient.sendEvalCommand(code);
                    messageProvider?.addMessage(`执行Eval: ${code}`);
                    return;
                }

                // 否则弹出输入框
                const inputCode = await vscode.window.showInputBox({
                    prompt: '输入要执行的代码',
                    placeHolder: '例如: users()',
                    ignoreFocusOut: true
                });

                if (inputCode) {
                    outputChannel.appendLine(`执行Eval: ${inputCode}`);
                    tcpClient.sendEvalCommand(inputCode);
                    messageProvider?.addMessage(`执行Eval: ${inputCode}`);
                }
            } catch (error) {
                outputChannel.appendLine(`执行Eval失败: ${error}`);
                messageProvider?.addMessage(`执行Eval失败: ${error}`);
                vscode.window.showErrorMessage(`执行Eval失败: ${error}`);
            }
        },
        'game-server-compiler.restart': async () => {
            outputChannel.appendLine('==== 执行重启命令 ====');
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
                    outputChannel.appendLine('发送重启命令');
                    tcpClient.sendRestartCommand();
                    messageProvider?.addMessage('已发送重启命令');
                    vscode.window.showInformationMessage('已发送重启命令');
                } catch (error) {
                    outputChannel.appendLine(`发送重启命令失败: ${error}`);
                    messageProvider?.addMessage(`发送重启命令失败: ${error}`);
                    vscode.window.showErrorMessage(`发送重启命令失败: ${error}`);
                }
            }
        }
    };

    // 注册所有命令
    Object.entries(commands).forEach(([commandId, handler]) => {
        outputChannel.appendLine(`注册命令: ${commandId}`);
        context.subscriptions.push(vscode.commands.registerCommand(commandId, handler));
        outputChannel.appendLine(`命令 ${commandId} 注册成功`);
    });

    // 注册文件保存监听
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(async (document) => {
            const config = configManager.getConfig();
            
            // 添加调试日志
            outputChannel.appendLine('==== 执行编译当前文件命令 ====');
            outputChannel.appendLine(`原始文件路径: ${document.fileName}`);
            
            // 首先检查登录状态
            if (!tcpClient.isLoggedIn()) {
                outputChannel.appendLine('角色未登录,跳过编译');
                return;
            }
            
            // 然后检查连接状态
            if (!tcpClient.isConnected()) {
                outputChannel.appendLine('服务器未连接,跳过编译');
                return;
            }
            
            // 最后检查自动编译设置
            outputChannel.appendLine(`自动编译设置: ${config.compile.autoCompileOnSave}`);
            if (!config.compile.autoCompileOnSave) {
                outputChannel.appendLine('自动编译未开启,跳过编译');
                return;
            }
            
            // 检查文件类型
            if (!isCompilableFile(document.fileName)) {
                outputChannel.appendLine('不是可编译的文件类型，跳过编译');
                return;
            }
            
            try {
                const filePath = document.uri.fsPath;
                const mudPath = convertToMudPath(filePath);
                outputChannel.appendLine(`转换后的MUD路径: ${mudPath}`);
                messageProvider?.addMessage(`编译文件: ${mudPath}`);
                tcpClient.sendUpdateCommand(mudPath);
                outputChannel.appendLine('编译命令已发送');
            } catch (error) {
                outputChannel.appendLine(`编译失败: ${error}`);
                messageProvider?.addMessage(`编译失败: ${error}`);
            }
        })
    );

    // 将输出面板添加到订阅中
    context.subscriptions.push(outputChannel);

    outputChannel.appendLine('插件初始化完成');
    messageProvider.addMessage('插件初始化完成');
}

export function deactivate() {
    console.log('停用插件...');
    try {
        if (tcpClient?.isConnected()) {
            tcpClient.disconnect();
        }
        messageProvider?.dispose();
        configManager?.dispose();
        console.log('插件停用完成');
    } catch (error) {
        console.error('插件停用错误:', error);
    }
} 
