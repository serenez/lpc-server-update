import * as vscode from 'vscode';
import { CompileManager } from '../compile/CompileManager';
import { ConfigManager } from '../config/ConfigManager';
import { ConnectionState } from '../state/ConnectionState';
import { LogManager, LogLevel } from '../log/LogManager';
import { TcpClient } from '../tcpClient';
import { ServiceLocator } from '../ServiceLocator';
import { IDisposable } from '../interfaces/IDisposable';
import { CompileError, NetworkError } from '../errors';

export class CommandManager implements IDisposable {
    private static instance: CommandManager | null = null;
    private compileManager: CompileManager;
    private configManager: ConfigManager;
    private connectionState: ConnectionState;
    private logManager: LogManager;
    private tcpClient: TcpClient;

    private constructor(private serviceLocator: ServiceLocator) {
        this.compileManager = serviceLocator.getService('compileManager');
        this.configManager = serviceLocator.getService('configManager');
        this.connectionState = serviceLocator.getService('connectionState');
        this.logManager = serviceLocator.getService('logManager');
        this.tcpClient = serviceLocator.getService('tcpClient');
    }

    static getInstance(serviceLocator: ServiceLocator): CommandManager {
        if (CommandManager.instance === null) {
            CommandManager.instance = new CommandManager(serviceLocator);
        }
        return CommandManager.instance;
    }

    registerCommands(context: vscode.ExtensionContext): void {
        const commands = {
            'game-server-compiler.connect': this.handleConnect.bind(this),
            'game-server-compiler.compileCurrentFile': this.handleCompileCurrentFile.bind(this),
            'game-server-compiler.compileDir': this.handleCompileDir.bind(this),
            'game-server-compiler.sendCommand': this.handleSendCommand.bind(this),
            'game-server-compiler.eval': this.handleEval.bind(this),
            'game-server-compiler.restart': this.handleRestart.bind(this)
        };

        Object.entries(commands).forEach(([id, handler]) => {
            context.subscriptions.push(
                vscode.commands.registerCommand(id, handler)
            );
        });
    }

    private async handleConnect(): Promise<void> {
        try {
            this.logManager.log('处理连接命令', LogLevel.DEBUG, 'CommandManager');
            const state = this.connectionState.getState();

            if (state.connected) {
                const disconnect = await vscode.window.showQuickPick(['是', '否'], {
                    placeHolder: '服务器已连接，是否断开连接？'
                });
                
                if (disconnect === '是') {
                    await this.tcpClient.disconnect();
                }
                return;
            }

            const config = this.configManager.getConfig();
            if (!config.host || !config.port) {
                throw new NetworkError('请先配置服务器地址和端口');
            }

            await this.tcpClient.connect(config.host, config.port);
        } catch (error) {
            this.logManager.log(`连接失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`连接失败: ${error}`);
        }
    }

    private async handleCompileCurrentFile(): Promise<void> {
        try {
            this.logManager.log('处理编译当前文件命令', LogLevel.DEBUG, 'CommandManager');
            
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                throw new CompileError('没有打开的文件');
            }

            const filePath = editor.document.uri.fsPath;
            await this.compileManager.compileFile(filePath);
        } catch (error) {
            this.logManager.log(`编译失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`编译失败: ${error}`);
        }
    }

    private async handleCompileDir(): Promise<void> {
        try {
            this.logManager.log('处理编译目录命令', LogLevel.DEBUG, 'CommandManager');
            
            const config = this.configManager.getConfig();
            const dirPath = await vscode.window.showInputBox({
                prompt: '输入要编译的目录路径',
                placeHolder: '例如: /cmds',
                value: config.compile.defaultDir
            });

            if (dirPath) {
                if (dirPath !== config.compile.defaultDir) {
                    await this.configManager.updateConfig({
                        compile: { ...config.compile, defaultDir: dirPath }
                    });
                }
                await this.compileManager.compileDirectory(dirPath);
            }
        } catch (error) {
            this.logManager.log(`编译目录失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`编译目录失败: ${error}`);
        }
    }

    private async handleSendCommand(command?: string): Promise<void> {
        try {
            this.logManager.log('处理发送命令', LogLevel.DEBUG, 'CommandManager');
            
            if (!this.tcpClient.isConnected() || !this.tcpClient.isLoggedIn()) {
                throw new NetworkError('请先连接服务器并确保角色已登录');
            }

            const inputCommand = command || await vscode.window.showInputBox({
                prompt: '输入要发送的命令',
                placeHolder: '例如: update /path/to/file'
            });

            if (inputCommand) {
                await this.tcpClient.sendCustomCommand(inputCommand);
                this.logManager.log(`发送命令: ${inputCommand}`, LogLevel.INFO, 'CommandManager');
            }
        } catch (error) {
            this.logManager.log(`发送命令失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`发送命令失败: ${error}`);
        }
    }

    private async handleEval(code?: string): Promise<void> {
        try {
            this.logManager.log('处理Eval命令', LogLevel.DEBUG, 'CommandManager');
            
            if (!this.tcpClient.isConnected() || !this.tcpClient.isLoggedIn()) {
                throw new NetworkError('请先连接服务器并确保角色已登录');
            }

            const inputCode = code || await vscode.window.showInputBox({
                prompt: '输入要执行的代码',
                placeHolder: '例如: users()'
            });

            if (inputCode) {
                await this.tcpClient.sendEvalCommand(inputCode);
                this.logManager.log(`执行Eval: ${inputCode}`, LogLevel.INFO, 'CommandManager');
            }
        } catch (error) {
            this.logManager.log(`执行Eval失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`执行Eval失败: ${error}`);
        }
    }

    private async handleRestart(): Promise<void> {
        try {
            this.logManager.log('处理重启命令', LogLevel.DEBUG, 'CommandManager');
            
            if (!this.tcpClient.isConnected() || !this.tcpClient.isLoggedIn()) {
                throw new NetworkError('请先连接服务器并确保角色已登录');
            }

            const confirm = await vscode.window.showWarningMessage(
                '确定要重启服务器吗？',
                { modal: true },
                '确定',
                '取消'
            );

            if (confirm === '确定') {
                await this.tcpClient.sendRestartCommand();
                this.logManager.log('已发送重启命令', LogLevel.INFO, 'CommandManager');
                vscode.window.showInformationMessage('已发送重启命令');
            }
        } catch (error) {
            this.logManager.log(`重启失败: ${error}`, LogLevel.ERROR, 'CommandManager');
            vscode.window.showErrorMessage(`重启失败: ${error}`);
        }
    }

    dispose(): void {
        CommandManager.instance = null;
    }
} 
