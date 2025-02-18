import * as net from 'net';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LogManager, LogLevel } from './log/LogManager';
import * as path from 'path';
import * as fs from 'fs';
import { ButtonProvider } from './buttonProvider';
import * as iconv from 'iconv-lite';
import { MessageParser } from './utils/messageParser';
import { IDisposable } from './interfaces/IDisposable';
import { ConfigManager } from './config/ConfigManager';

interface MessageOutput {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
}

interface MessageChannels {
    debug: MessageOutput;
    server: MessageOutput;
}

export class TcpClient implements IDisposable {
    private socket: net.Socket | null = null;
    private connected: boolean = false;
    private loggedIn: boolean = false;
    private versionVerified: boolean = false;
    private isFirstData: boolean = true;
    private outputChannel: vscode.OutputChannel;
    private buttonProvider: ButtonProvider;
    private messageProvider: any;
    private reconnectTimer: NodeJS.Timeout | null = null;
    private lastHost: string = '';
    private lastPort: number = 0;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10;
    private reconnectInterval: number = 5000;
    private _isReconnecting: boolean = false;
    private isFirstConnect = true;
    private isFirstLogin = true;
    private ESC = '\x1b';
    private retryCount: number = 0;
    private retryTimer: NodeJS.Timeout | null = null;
    private config: vscode.WorkspaceConfiguration;
    private resultBuffer: string = '';
    private isCollectingResult: boolean = false;
    private muyBuffer: string = '';
    private isCollectingMuy: boolean = false;
    private encoding: string = 'UTF8';
    private messageBuffer: string[] = [];
    private bufferTimer: NodeJS.Timeout | null = null;
    private readonly BUFFER_FLUSH_INTERVAL = 100; // 100ms
    private diagnosticCollection: vscode.DiagnosticCollection | null = null;
    private configManager: ConfigManager;
    private isCollectingError: boolean = false;
    private firstErrorFile: string = ''; // 添加变量存储第一个错误文件路径
    private errorLine: number = 0;
    private errorMessage: string = '';
    private isIgnoringStackTrace: boolean = false;

    constructor(
        outputChannel: vscode.OutputChannel,
        buttonProvider: ButtonProvider,
        messageProvider: any
    ) {
        this.outputChannel = outputChannel;
        this.buttonProvider = buttonProvider;
        this.messageProvider = messageProvider;
        this.configManager = ConfigManager.getInstance();
        this.config = vscode.workspace.getConfiguration('gameServerCompiler');
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gameServerCompiler.connection')) {
                this.config = vscode.workspace.getConfiguration('gameServerCompiler');
            }
        });
        this.initSocket();
        this.initMessageBuffer();
        
        // 创建诊断集合
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lpc');

        // 修改文件保存事件处理
        vscode.workspace.onDidSaveTextDocument(doc => {
            // 清除所有诊断信息
            this.clearDiagnostics();
            
            // 重置编译错误相关状态
            this.isCollectingError = false;
            this.firstErrorFile = '';
            this.errorLine = 0;
            this.errorMessage = '';
        });
    }

    private initSocket() {
        if (this.socket) {
            this.log('清理现有socket连接', LogLevel.DEBUG);
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        
        this.socket = new net.Socket();
        this.log('创建新的socket实例', LogLevel.DEBUG);
        
        this.socket.setKeepAlive(true, 60000);
        this.socket.setNoDelay(true);
        
        this.updateEncoding();
        
        this.socket.on('connect', () => {
            this.log('==== Socket连接事件 ====', LogLevel.DEBUG);
            this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
            this.log(`登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
            this.log(`当前编码: ${this.encoding}`, LogLevel.DEBUG);
            
            this.reconnectAttempts = 0;
            this.isFirstData = true;
          this.log('已连接到游戏服务器', LogLevel.INFO);
        });

        let buffer = MessageParser.createEmptyBuffer();
        
        this.socket.on('data', (data) => {
            try {
                buffer = MessageParser.concatBuffers([buffer, data]);
                
                const decodedData = MessageParser.bufferToString(buffer, this.encoding);
                
                if (decodedData.endsWith('\n')) {
                    const messages = decodedData.split('\n');
                    
                    buffer = MessageParser.createEmptyBuffer();
                    
                    for (let message of messages) {
                        if (message) {
                            if (message.startsWith(`${this.ESC}[2;37;0m`)) {
                                message = message.replace(`${this.ESC}[2;37;0m`, '');
                            }
                            const shouldTrim = !message.includes(this.ESC + 'MUY') && 
                                             !message.match(/^\x1b\d{3}/);
                            const processedMessage = shouldTrim ? message.trim() : message;
                            
                            if (processedMessage) {
                                this.processMessage(processedMessage);
                            }
                        }
                    }
                }
            } catch (error) {
                this.log(`消息处理错误: ${error}`, LogLevel.ERROR);
                buffer = MessageParser.createEmptyBuffer();
                this.resultBuffer = '';
                this.isCollectingResult = false;
            }
        });

        this.socket.on('error', (err) => {
            this.log('==== Socket错误事件 ====', LogLevel.ERROR);
            this.log(`错误信息: ${err.message}`, LogLevel.ERROR);
            this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
            this.log(`登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
            this.handleConnectionError(err);
        });

        this.socket.on('close', (hadError) => {
            this.log('==== Socket关闭事件 ====', LogLevel.DEBUG);
            this.log(`是否因错误关闭: ${hadError}`, LogLevel.DEBUG);
            this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
            this.log(`登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
            this.handleDisconnect();
        });

        this.socket.on('end', () => {
            this.log('==== Socket结束事件 ====', LogLevel.DEBUG);
            this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
            this.log(`登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
            this.handleDisconnect();
        });
    }

    private cleanColorCodes(text: string): string {
        if (!text) return text;
        
        let result = text;
        
        result = result.replace(/\x1b\[f#[0-9a-fA-F]{6}m/g, '');
        
        result = result.replace(/\x1b\[3[0-7]m/g, '');
        
        result = result.replace(/\x1b\[1;3[0-7]m/g, '');
        
        result = result.replace(/\x1b\[4[0-7]m/g, '');
        
        result = result.replace(/\x1b\[4[0-7];1m/g, '');
        
        const controlCodes = [
            '\\[2;37;0m',  // NOR
            '\\[1m',       // BOLD
            '\\[2J',       // CLR
            '\\[H',        // HOME
            '\\[s',        // SAVEC
            '\\[u',        // REST
            '\\[5m',       // BLINK
            '\\[4m',       // U
            '\\[7m',       // REV
            '\\[1,7m',     // HIREV
            '\\[9m',       // DENGKUAN
            '\\[r',        // UNFR
            '\\[2;25r',    // FRTOP
            '\\[1;24r'     // FRBOT
        ];
        
        controlCodes.forEach(code => {
            result = result.replace(new RegExp('\x1b' + code, 'g'), '');
        });
        
        result = result.replace(/\x1b/g, '');
        
        return result;
    }

    private processMessage(message: string): void {
        try {
            if (message.startsWith('\x1b012')) {
                return;
            }
            
            // 检查是否正在收集编译错误
            if (this.isCollectingError) {
                this.log(`[错误收集] 当前消息: ${message}`, LogLevel.DEBUG);
                
                // 移除 .c 后缀再比较
                const expectedPath = this.firstErrorFile.replace(/\.c$/, '');
                this.log(`[错误收集] 结束标记为: Error in loading object '${expectedPath}'`, LogLevel.DEBUG);
                
                if (message === `*Error in loading object '${expectedPath}'`) {
                    this.log('[错误收集] 检测到结束标记', LogLevel.DEBUG);
                    // 结束收集
                    this.isCollectingError = false;
                    if (this.messageProvider) {
                        const errorMsg = `❌ 编译错误:\n文件: ${this.firstErrorFile}\n行号: ${this.errorLine}\n错误: ${this.errorMessage}`;
                        this.log('[错误收集] 准备显示错误信息', LogLevel.DEBUG);
                        this.messageProvider.addMessage(errorMsg);
                        this.log(errorMsg, LogLevel.ERROR, false);
                        
                        // 在编辑器中显示错误
                        this.showDiagnostics(this.firstErrorFile, this.errorLine - 1, this.errorMessage);
                    }
                    // 重置错误相关状态
                    this.log('[错误收集] 重置错误状态', LogLevel.DEBUG);
                    this.firstErrorFile = '';
                    this.errorLine = 0;
                    this.errorMessage = '';
                    return;
                }
                this.log('[错误收集] 继续收集', LogLevel.DEBUG);
                return;
            }

            // 检查是否开始编译错误
            const errorMatch = message.match(/编译时段错误：([^:]+\.c)\s+line\s+(\d+):\s*(.*)/);
            if (errorMatch) {
                this.log('[错误处理] 检测到编译错误开始', LogLevel.DEBUG);
                const [, filePath, lineNum, errorMessage] = errorMatch;
                
                // 重置之前的错误状态
                this.log('[错误处理] 清除之前的诊断信息', LogLevel.DEBUG);
                this.clearDiagnostics();
                
                // 设置新的错误信息
                this.log(`[错误处理] 设置错误信息: ${filePath}:${lineNum}`, LogLevel.DEBUG);
                this.firstErrorFile = filePath;
                this.errorLine = parseInt(lineNum);
                this.errorMessage = errorMessage;
                
                // 开始收集错误
                this.log('[错误处理] 开始错误收集', LogLevel.DEBUG);
                this.isCollectingError = true;
                return;
            }

            // 检查编译成功消息
            if (message.includes('重新编译完毕')) {
                this.log('[编译] 检测到编译完成', LogLevel.DEBUG);
                // 清除所有错误状态
                this.clearDiagnostics();
                this.isCollectingError = false;
                this.firstErrorFile = '';
                this.errorLine = 0;
                this.errorMessage = '';
                
                // 显示成功消息
                this.messageProvider?.addMessage('✅ 编译成功');
                return;
            }

            if (this.isCollectingMuy) {
                this.muyBuffer += message;
                
                if (this.muyBuffer.includes('║')) {
                    const endIndex = this.muyBuffer.indexOf('║') + 1;
                    const completeMessage = this.muyBuffer.substring(0, endIndex);
                    
                    const content = completeMessage.substring(completeMessage.indexOf('MUY') + 3, completeMessage.indexOf('║'));
                    this.log(`提取的原始内容: ${content}`, LogLevel.DEBUG);
                    
                    let cleanedContent = content.replace(/\/\*[\s\S]*?\*\//g, '');
                    cleanedContent = this.cleanColorCodes(cleanedContent);
                    cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, '');
                    
                    try {
                        this.log('开始解析LPC映射...', LogLevel.DEBUG);
                        const jsonObj = this.parseLPCMapping(cleanedContent);
                        const formattedJson = JSON.stringify(jsonObj, null, 2);
                        
                        if (this.messageProvider) {
                            this.messageProvider.addMessage(`🔍 Eval结果:\n${formattedJson}`);
                        }
                    } catch (error) {
                        this.log(`解析MUY消息失败: ${error}`, LogLevel.ERROR);
                    }
                    
                    this.muyBuffer = '';
                    this.isCollectingMuy = false;
                    
                    const remainingMessage = completeMessage.substring(endIndex);
                    if (remainingMessage.length > 0) {
                        this.processMessage(remainingMessage);
                    }
                }
                return;
            }
            
            if (message.startsWith(this.ESC + 'MUY')) {
                const muyStart = message.indexOf(this.ESC + 'MUY');
                this.isCollectingMuy = true;
                this.muyBuffer = message.substring(muyStart);
                
                if (this.muyBuffer.includes('║')) {
                    this.processMessage(this.muyBuffer);
                }
                return;
            }
            
            if (!this.isCollectingMuy) {
                const protocolMatch = message.match(/^\x1b(\d{3})(.*)/);
                if (protocolMatch) {
                    const [, protocolCode, content] = protocolMatch;
                    this.processProtocolMessage(protocolCode, content);
                    return;
                }

                this.processNormalMessage(message);
            }
        } catch (error) {
            this.log(`处理消息失败: ${error}`, LogLevel.ERROR);
        }
    }

    private processNormalMessage(message: string) {
        try {
            const cleanedMessage = this.cleanColorCodes(message);
            
            this.log(`处理普通消息: ${cleanedMessage}`, LogLevel.DEBUG);

            if (cleanedMessage === '版本验证成功') {
                this.log('版本验证成功，开始登录', LogLevel.INFO);
                this.login();
            } else if (cleanedMessage.includes('muy_update:')) {
                const match = cleanedMessage.match(/muy_update:(.*)/);
                    if (match) {
                        const dependencyFile = match[1].trim();
                    this.log(`检测到依赖文件更新: ${dependencyFile}`, LogLevel.INFO);
                        this.sendUpdateCommand(dependencyFile);
                    }
            } else if (cleanedMessage.startsWith('ver')) {
                this.log('收到服务器连接成功信号', LogLevel.INFO);
                this.connected = true;
                this.handleStatusChange('connected', '服务器连接成功！');
                this.sendKey();
            } else if (cleanedMessage.includes('客户端非法')) {
                const errorMsg = '服务器验证失败：客户端非法。请检查服务器密钥配置是否正确。';
                this.log(errorMsg, LogLevel.ERROR, false);
                this.stopReconnect();
                this._isReconnecting = false;
                this.reconnectAttempts = this.maxReconnectAttempts;
                this.disconnect();
            } else if (cleanedMessage.trim()) {
                this.appendToGameLog(cleanedMessage);
                
                let icon = '';
                if (/^[.]+$/.test(cleanedMessage)) {
                    icon = '⏳ ';
                } else if (cleanedMessage.includes('【系统提示】')) {
                    icon = '🔔 ';
                } else if (cleanedMessage.includes('成功编译')) {
                    icon = '✨ ';
                } else if (cleanedMessage.includes('开始编译')) {
                    icon = '🔄 ';
                } else if (cleanedMessage.includes('整理了目录')) {
                    icon = '📦 ';
                } else if (cleanedMessage.includes('总共有') && cleanedMessage.includes('档案被成功编译')) {
                    icon = '🎉 ';
                } else if (cleanedMessage.includes('成功')) {
                    icon = '✅ ';
                } else if (cleanedMessage.includes('失败') || cleanedMessage.includes('错误')) {
                    icon = '❌ ';
                } else if (cleanedMessage.includes('警告') || cleanedMessage.includes('注意')) {
                    icon = '⚠️ ';
                } else if (cleanedMessage.includes('系统消息:')) {
                    icon = '🔧 ';
                } else if (cleanedMessage.includes('断开连接')) {
                    icon = '🔌 ';
                }
                
                const formattedMessage = `${icon}${cleanedMessage}`;
                if (this.messageProvider) {
                    this.messageProvider.addMessage(formattedMessage);
                }
            }
        } catch (error) {
            this.log(`处理普通消息失败: ${error}`, LogLevel.ERROR);
        }
    }

    private processProtocolMessage(code: string, content: string) {
        const cleanedContent = this.cleanColorCodes(content);
        
        switch(code) {
            case '012':
                break;
            case '000':
                if (cleanedContent === '0007') {
                    this.log('收到登录成功信号', LogLevel.INFO);
                this.setLoginState(true);
                }
                break;
          case '014':
            this.log(`收到014协议消息: ${cleanedContent}`, LogLevel.DEBUG);
            this.sendCommand(cleanedContent);
                break;
            case '015':
                if (cleanedContent.includes('密码错误') || cleanedContent.includes('账号不存在')) {
                    this.log(cleanedContent, LogLevel.ERROR, false);
                    this.outputChannel.appendLine(`❌ ${cleanedContent}`);
                    this.disconnect();
                } else if (cleanedContent.includes('更新中') || cleanedContent.includes('维护中')) {
                    this.log(cleanedContent, LogLevel.INFO, false);
                    this.outputChannel.appendLine(`🔧 ${cleanedContent}`);
                    this.disconnect();
                } else {
                    this.log(cleanedContent, LogLevel.INFO);
                    let icon = '';
                    if (cleanedContent.includes('成功')) {
                        icon = '✅ ';
                    } else if (cleanedContent.includes('失败') || cleanedContent.includes('错误')) {
                        icon = '❌ ';
                    } else if (cleanedContent.includes('警告') || cleanedContent.includes('注意')) {
                        icon = '⚠️ ';
                    } else if (cleanedContent.includes('系统消息:')) {
                        icon = '🔧 ';
                    } else if (cleanedContent.includes('断开连接')) {
                        icon = '🔌 ';
                    }
                    this.outputChannel.appendLine(`${icon}${cleanedContent}`);
                }
                break;
        }
    }

    private cleanAnsiCodes(text: string): string {
        return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
    }

    private convertAnsiToVscode(text: string): string {
        let result = text;
        
        const colorMap: { [key: string]: string } = {
            '\\[30m': '\x1b[30m',
            '\\[31m': '\x1b[31m',
            '\\[32m': '\x1b[32m',
            '\\[33m': '\x1b[33m',
            '\\[34m': '\x1b[34m',
            '\\[35m': '\x1b[35m',
            '\\[36m': '\x1b[36m',
            '\\[37m': '\x1b[37m',
            '\\[1;30m': '\x1b[1;30m',
            '\\[1;31m': '\x1b[1;31m',
            '\\[1;32m': '\x1b[1;32m',
            '\\[1;33m': '\x1b[1;33m',
            '\\[1;34m': '\x1b[1;34m',
            '\\[1;35m': '\x1b[1;35m',
            '\\[1;36m': '\x1b[1;36m',
            '\\[1;37m': '\x1b[1;37m',
            '\\[2;37;0m': '\x1b[0m',
        };

        for (const [key, value] of Object.entries(colorMap)) {
            const pattern = this.ESC + key;
            result = result.replace(new RegExp(pattern, 'g'), value);
        }

        result = result.replace(/\$zj#/g, ' | ');
        result = result.replace(/\$z2#/g, ' | ');
        result = result.replace(/\$br#/g, '\n');

        return result;
    }

    private log(message: string, level: LogLevel = LogLevel.INFO, showNotification: boolean = false) {
        if (message.trim()) {
            const cleanMessage = this.cleanAnsiCodes(message);
            let prefix = level === LogLevel.ERROR ? '[错误]' : level === LogLevel.DEBUG ? '[调试]' : '[信息]';
            this.outputChannel.appendLine(`${prefix} ${cleanMessage}`);

            let icon = '';
            let content = '';
            let shouldShow = false;

            if (level === LogLevel.ERROR) {
                if (message.includes('连接错误') || message.includes('连接失败')) {
                    icon = '❌ ';
                    content = '服务器连接失败';
                    shouldShow = true;
                } else if (message.includes('验证失败')) {
                    icon = '❌ ';
                    content = '服务器验证失败';
                    shouldShow = true;
                } else if (message.includes('登录失败') || message.includes('登录超时')) {
                    icon = '❌ ';
                    content = '角色登录失败';
                    shouldShow = true;
                }
            } else if (level === LogLevel.INFO) {
                if (message.includes('正在初始化插件')) {
                    icon = '🔧 ';
                    content = '正在初始化插件...';
                    shouldShow = true;
                } else if (message.includes('插件初始化完成')) {
                    icon = '✅ ';
                    content = '插件初始化完成';
                    shouldShow = true;
                } else if (message.includes('服务器连接成功')) {
                    if (!this.connected || message.includes('成功连接到')) {
                        icon = '🔌 ';
                        content = '服务器连接成功';
                        shouldShow = true;
                    }
                } else if (message.includes('版本验证成功')) {
                    icon = '✅ ';
                    content = '版本验证通过';
                    shouldShow = true;
                } else if (message.includes('角色登录成功')) {
                    if (!this.loggedIn || this.isFirstLogin) {
                        icon = '👤 ';
                        content = '角色登录成功';
                        shouldShow = true;
                        this.isFirstLogin = false;
                    }
                } else if (message.includes('断开连接')) {
                    icon = '🔌 ';
                    content = '服务器已断开';
                    shouldShow = true;
                }
            }

            if (shouldShow && content) {
                this.outputChannel.appendLine(`${icon}${content}`);
            }

            if (showNotification) {
                if (level === LogLevel.ERROR) {
                    vscode.window.showErrorMessage(cleanMessage);
                } else {
                    vscode.window.showInformationMessage(cleanMessage);
                }
            }
        }
    }

    private sha1(data: string): string {
        return crypto.createHash('sha1').update(data).digest('hex');
    }

    private startReconnect() {
        if (this.reconnectTimer || !this.lastHost || !this.lastPort) {
            return;
        }

        this._isReconnecting = true;
        this.log('开始重连流程', LogLevel.INFO);

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log(`已达到最大重连次数(${this.maxReconnectAttempts})，停止重连`, LogLevel.ERROR);
            this.stopReconnect();
            return;
        }

        if (this.reconnectAttempts === 0) {
            this.log('与服务器的连接已断开，开始重连...', LogLevel.INFO);
            vscode.window.showInformationMessage('与服务器的连接已断开，正在尝试重连...');
        }

        this.reconnectTimer = setInterval(async () => {
            if (this.connected) {
                this.stopReconnect();
                return;
            }

            this.reconnectAttempts++;
            this.log(`尝试重新连接服务器中...(${this.reconnectAttempts}/${this.maxReconnectAttempts})`, LogLevel.INFO);

            try {
                await this.connect(this.lastHost, this.lastPort);
                if (this.connected) {
                    this.stopReconnect();
                }
            } catch (err) {
                if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                    this.stopReconnect();
                    this.log('重连失败，已达到最大重试次数', LogLevel.ERROR);
                    vscode.window.showErrorMessage('重连失败，请手动重新连接服务器');
                }
            }
        }, this.reconnectInterval);
    }

    private stopReconnect() {
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this._isReconnecting = false;
    }

    async connect(host: string, port: number): Promise<void> {
        if (this.connected) {
            this.log('已经连接到服务器', LogLevel.INFO);
            return;
        }

        return new Promise((resolve, reject) => {
        try {
            this.lastHost = host;
            this.lastPort = port;
            this.log(`正在连接到 ${host}:${port}`, LogLevel.INFO);
            
            this.initSocket();

                const timeout = this.config.get<number>('connection.timeout', 10000);
                const timeoutPromise = new Promise<void>((_, reject) => {
                    setTimeout(() => reject(new Error('连接超时')), timeout);
                });

                const connectPromise = new Promise<void>((resolve, reject) => {
                this.socket?.once('error', (err) => {
                        this.log(`连接错误: ${err.message}`, LogLevel.ERROR);
                    reject(err);
                });

                    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
                    
                    if (isLocalhost) {
                        this.log('检测到本地回环地址，尝试使用实际IP', LogLevel.INFO);
                        this.socket?.connect(port, '127.0.0.1', () => {
                            this.log('Socket连接成功', LogLevel.INFO);
                            this.setConnectionState(true);
                            resolve();
                        });
                    } else {
                        this.socket?.connect(port, host, () => {
                            this.log('Socket连接成功', LogLevel.INFO);
                            this.setConnectionState(true);
                            resolve();
                        });
                    }
                });

                Promise.race([connectPromise, timeoutPromise])
                    .then(() => {
                        this.log('连接成功，等待服务器响应', LogLevel.INFO);
                        resolve();
                    })
                    .catch((error) => {
                        this.handleConnectionError(error);
                        reject(error);
                    });

        } catch (error) {
            this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
                reject(error);
        }
        });
    }

    private async sendKey() {
        try {
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (!fs.existsSync(configPath)) {
                throw new Error('配置文件不存在，请先配置muy-lpc-update.json');
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.serverKey) {
                throw new Error('服务器密钥未配置，请在muy-lpc-update.json中配置serverKey');
            }

            const key = this.sha1(config.serverKey);
            this.log('发送验证密钥...', LogLevel.DEBUG);
            
            const encodedKey = MessageParser.stringToBuffer(key + '\n', this.encoding);
            this.socket?.write(encodedKey, () => {
                this.log('验证密钥发送完成', LogLevel.DEBUG);
            });
        } catch (error) {
            const errorMsg = `发送验证密钥失败: ${error}`;
            this.log(errorMsg, LogLevel.ERROR, false);
            this.disconnect();
        }
    }

    private async login() {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const configPath = path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            this.log('开始登录...', LogLevel.INFO);
            this.log(`当前状态: connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.INFO);
            
            const loginKey = config.loginKey || 'buyi-ZMuy';
            const loginString = config.loginWithEmail ? 
                `${config.username}║${config.password}║${loginKey}║zmuy@qq.com\n` :
                `${config.username}║${config.password}║${loginKey}\n`;
            
            this.log(`发送登录信息: ${loginString}`, LogLevel.INFO);
            
            const encodedData = MessageParser.stringToBuffer(loginString, this.encoding);
            this.socket?.write(encodedData, () => {
                this.log('登录信息发送完成', LogLevel.DEBUG);
            });
        } catch (error) {
            const errorMsg = `登录失败: ${error}`;
            this.log(errorMsg, LogLevel.ERROR, false);
            this.disconnect();
        }
    }

    private sendCommand(command: string, commandName: string = '命令') {
        if (!this.checkState()) {
            return;
        }
        
        try {
            this.log(`发送${commandName}: ${command}`, LogLevel.DEBUG);
            this.socket?.write(command + '\n');
            this.log(`${commandName}发送完成`, LogLevel.DEBUG);
        } catch (error) {
            const errorMessage = `发送${commandName}失败: ${error}`;
            this.log(errorMessage, LogLevel.ERROR);
            vscode.window.showErrorMessage(errorMessage);
        }
    }

    async sendUpdateCommand(filePath: string) {
        if (!this.checkState()) {
            return;
        }
        this.log(`准备发送更新命令，文件路径: ${filePath}`, LogLevel.INFO);
        this.sendCommand(`update ${filePath}`, '更新命令');
    }

    async sendCompileCommand(command: string, showDetails: boolean = true) {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const timeout = config.get<number>('compile.timeout', 30000);

        try {
            if (showDetails) {
                this.log(`发送编译命令: ${command}`, LogLevel.INFO);
            }

            const compilePromise = new Promise<void>((resolve, reject) => {
                try {
                    this.sendCommand(command, '编译命令');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('编译超时')), timeout);
            });

            await Promise.race([compilePromise, timeoutPromise]);
            
            if (showDetails) {
                this.log('编译命令发送完成', LogLevel.INFO);
            }
            
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`编译失败: ${errorMessage}`, LogLevel.ERROR);
            if (showDetails) {
                vscode.window.showErrorMessage(`编译失败: ${errorMessage}`);
            }
            return false;
        }
    }

    public disconnect() {
        this.log('==== 开始主动断开连接 ====', LogLevel.INFO);
        
        this.stopReconnect();
        
        if (this.socket) {
            this.log('正在关闭socket连接...', LogLevel.INFO);
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        
        this.lastHost = '';
        this.lastPort = 0;
        this.reconnectAttempts = 0;
        this.versionVerified = false;
        this.connected = false;
        this.loggedIn = false;
        this.isFirstData = true;
        this.isCollectingResult = false;
        this.resultBuffer = '';
        this._isReconnecting = false;
        
        this.isCollectingMuy = false;
        this.muyBuffer = '';
        
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        
        this.buttonProvider?.updateConnectionState(false);
        this.buttonProvider?.updateButtonState(false);
        
        this.setConnectionState(false);
        
        this.log('==== 主动断开连接完成 ====', LogLevel.INFO);
    }

    isConnected(): boolean {
        return this.connected;
    }

    isLoggedIn(): boolean {
        return this.loggedIn;
    }

    isReconnecting(): boolean {
        return this._isReconnecting;
    }

    private notifyImportantStatus(status: string) {
        if (status === 'connected' && this.isFirstConnect) {
            vscode.window.showInformationMessage('服务器连接成功');
            this.isFirstConnect = false;
        } 
        else if (status === 'disconnected') {
            vscode.window.showInformationMessage('服务器连接断开');
            this.isFirstConnect = true;
        }
        else if (status === 'loggedIn' && this.isFirstLogin) {
            vscode.window.showInformationMessage('角色登录成功');
            this.isFirstLogin = false;
        }
    }

    private checkCommandStatus(commandName: string, command: string | number) {
        this.log('==== 命令发送状态检查 ====', LogLevel.INFO);
        this.log(`命令: ${commandName} (${command})`, LogLevel.INFO);
        this.log(`连接状态: ${this.connected}`, LogLevel.INFO);
        this.log(`登录状态: ${this.loggedIn}`, LogLevel.INFO);
    }

    private handleStatusChange(status: 'connected' | 'disconnected' | 'loggedIn', message: string) {
        let showNotification = false;
        
        if (status === 'connected' && this.isFirstConnect) {
            showNotification = true;
            this.isFirstConnect = false;
            this.buttonProvider?.updateConnectionState(true);
        } 
        else if (status === 'disconnected') {
            this.connected = false;
            showNotification = true;
            this.isFirstConnect = true;
            this.isFirstLogin = true;
            this.buttonProvider?.updateConnectionState(false);
            this.buttonProvider?.updateButtonState(false);
            this.setLoginState(false);
            this.setConnectionState(false);
        }
        
        if (showNotification) {
        this.log(message, LogLevel.INFO, showNotification);
        }
    }

    private ensureUTF8(text: string): string {
        try {
            if (this.encoding.toUpperCase() === 'GBK') {
                const isUTF8 = text === iconv.decode(iconv.encode(text, 'UTF8'), 'UTF8');
                if (!isUTF8) {
                    const gbkBuffer = iconv.encode(text, 'GBK');
                    const utf8Text = iconv.decode(gbkBuffer, 'UTF8');
                    this.log(`编码转换成功: ${utf8Text}`, LogLevel.DEBUG);
                    return utf8Text;
                }
            }
            return text;
        } catch (error) {
            this.log(`编码转换失败: ${error}`, LogLevel.ERROR);
            return text;
        }
    }

    private appendToGameLog(message: string) {
        if (message.trim()) {
            const utf8Message = this.ensureUTF8(message);
            
            this.outputChannel.appendLine('================================');
            this.outputChannel.appendLine(`游戏消息: ${utf8Message}`);
            this.outputChannel.appendLine(`消息长度: ${utf8Message.length}`);
            this.outputChannel.appendLine(`接收时间: ${new Date().toISOString()}`);
            this.outputChannel.appendLine('消息分析:');
        }
    }

    private getProtocolName(code: string): string {
        const protocols: { [key: string]: string } = {
            '000': 'SYSY(系统消息)',
            '001': 'INPUTTXT(输入文本)',
            '002': 'ZJTITLE(标题)',
            '003': 'ZJEXIT(出口)',
            '004': 'ZJLONG(长消息)',
            '005': 'ZJOBIN(对象进入)',
            '006': 'ZJBTSET(按钮设置)',
            '007': 'ZJOBLONG(对象长消息)',
            '008': 'ZJOBACTS(对象动作)',
            '009': 'ZJOBACTS2(对象动作2)',
            '010': 'ZJYESNO(是否选择)',
            '011': 'ZJMAPTXT(地图文本)',
            '012': 'ZJHPTXT(HP文本)',
            '013': 'ZJMORETXT(更多文本)',
            '015': 'ZJTMPSAY(临时消息)',
            '016': 'ZJFMSG(浮动消息)',
            '018': 'ZJMSTR(字符串消息)',
            '020': 'ZJPOPMENU(弹出菜单)',
            '021': 'ZJTTMENU(标题菜单)',
            '022': 'ZJCHARHP(角色HP)',
            '023': 'ZJLONGXX(长消息XX)',
            '100': 'ZJCHANNEL(频道消息)',
            '999': 'SYSEXIT(系统退出)'
        };
        return protocols[code] || 'UNKNOWN';
    }

    private handleConnectionError(error: Error) {
        this.log('==== 处理连接错误 ====', LogLevel.ERROR);
        this.log(`错误类型: ${error.name}`, LogLevel.ERROR);
        this.log(`错误信息: ${error.message}`, LogLevel.ERROR);
        this.log(`错误堆栈: ${error.stack}`, LogLevel.ERROR);
        
        if (error.message.includes('ECONNREFUSED')) {
            this.log('服务器拒绝连接，请检查服务器地址和端口是否正确', LogLevel.ERROR, false);
        } else if (error.message.includes('ETIMEDOUT')) {
            this.log('连接超时，请检查网络连接和服务器状态', LogLevel.ERROR, false);
        } else if (error.message.includes('ENOTFOUND')) {
            this.log('找不到服务器，请检查服务器地址是否正确', LogLevel.ERROR, false);
        } else {
            this.log(`连接错误: ${error.message}`, LogLevel.ERROR, false);
        }

        this.handleDisconnect();
    }

    private async setConnectionState(isConnected: boolean) {
        if (this.connected !== isConnected) {
            this.connected = isConnected;
            if (!isConnected) {
                this.setLoginState(false);
            }
            
            this.log(`更新连接状态为: ${isConnected}`, LogLevel.INFO);
            
            this.buttonProvider?.updateConnectionState(isConnected);
            
            await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isConnected', isConnected);
            
            this.handleStatusChange(
                isConnected ? 'connected' : 'disconnected',
                `连接状态: ${isConnected}`
            );
        }
    }

    private handleDisconnect() {
        const wasConnected = this.connected;
        
        this.log('==== 开始处理断开连接 ====', LogLevel.INFO);
        this.log(`之前的连接状态: ${wasConnected}`, LogLevel.INFO);
        this.log(`Socket状态: ${this.socket ? '存在' : '不存在'}`, LogLevel.INFO);
        this.log(`重连状态: ${this._isReconnecting}`, LogLevel.INFO);
        this.log(`重连尝试次数: ${this.reconnectAttempts}`, LogLevel.INFO);
        
        this.setConnectionState(false);
        this.setLoginState(false);
        this.versionVerified = false;
        this.isFirstData = true;
        
        this.isCollectingMuy = false;
        this.muyBuffer = '';
        
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        
        this._isReconnecting = false;
        this.reconnectAttempts = 0;
        
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        
        if (this.buttonProvider) {
            this.buttonProvider.updateConnectionState(false);
            this.buttonProvider.updateButtonState(false);
        }
        
        this.log('==== 断开连接处理完成 ====', LogLevel.INFO);
        
        if (wasConnected && !this._isReconnecting) {
            this.startReconnect();
        }
    }

    private async setLoginState(isLoggedIn: boolean) {
        const prevState = this.loggedIn;
        this.loggedIn = isLoggedIn;
        
        this.log(`==== 设置登录状态 ====`, LogLevel.DEBUG);
        this.log(`之前状态: ${prevState}`, LogLevel.DEBUG);
        this.log(`新状态: ${isLoggedIn}`, LogLevel.DEBUG);
        this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
        
        vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', isLoggedIn);
        
        if (isLoggedIn && !prevState) {
            this.setConnectionState(true);
            this.buttonProvider?.updateConnectionState(true);
            this.buttonProvider?.updateButtonState(true);
            
            this.handleStatusChange('loggedIn', '角色登录成功');
        } else if (!isLoggedIn && prevState) {
            this.buttonProvider?.updateButtonState(false);
            this.log('角色已登出', LogLevel.INFO);
        }
    }

    private updateEncoding() {
        try {
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                let needsUpdate = false;
                
                if (!config.encoding) {
                    config.encoding = 'UTF8';
                    needsUpdate = true;
                    this.log('未找到编码配置，已设置为默认UTF8编码', LogLevel.INFO);
                }
                
                if (config.loginWithEmail === undefined) {
                    config.loginWithEmail = false;
                    needsUpdate = true;
                    this.log('未找到登录邮箱配置，已设置为默认false', LogLevel.INFO);
                }
                
                if (needsUpdate) {
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    this.log('配置文件已更新', LogLevel.INFO);
                }
                
                const newEncoding = config.encoding.toUpperCase();
                if (this.encoding !== newEncoding) {
                    this.encoding = newEncoding;
                    this.log(`编码设置已更新: ${this.encoding}`, LogLevel.INFO);
                }
                
                fs.watch(configPath, (eventType) => {
                    if (eventType === 'change') {
                        try {
                            const newConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                            const updatedEncoding = (newConfig.encoding || 'UTF8').toUpperCase();
                            if (updatedEncoding !== this.encoding) {
                                this.encoding = updatedEncoding;
                                this.log(`编码设置已更新: ${this.encoding}`, LogLevel.INFO);
                            }
                        } catch (error) {
                            this.log(`读取编码配置失败: ${error}`, LogLevel.ERROR);
                        }
                    }
                });
            } else {
                this.log('配置文件不存在，使用默认UTF8编码', LogLevel.INFO);
                this.encoding = 'UTF8';
            }
        } catch (error) {
            this.log(`读取编码配置失败: ${error}，使用默认UTF8编码`, LogLevel.ERROR);
            this.encoding = 'UTF8';
        }
    }

    private decodeData(data: Buffer): string {
        return MessageParser.bufferToString(data, this.encoding);
    }

    private encodeData(text: string): Buffer {
        return MessageParser.stringToBuffer(text, this.encoding);
    }

    private parseLPCMapping(content: string): any {
        if (!content.trim().startsWith('([') || !content.trim().endsWith('])')) {
            return content.trim();
        }

        try {
            content = content.substring(content.indexOf('([') + 2, content.lastIndexOf('])'));
            
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            this.log(`LPC映射清理注释后的内容: ${content}`, LogLevel.DEBUG);
            
            const pairs = this.splitPairs(content);
            this.log(`分割的键值对数量: ${pairs.length}`, LogLevel.DEBUG);
            
            const result: any = {};
            
            pairs.forEach(pair => {
                pair = pair.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                this.log(`处理键值对: ${pair}`, LogLevel.DEBUG);
                
                const [key, value] = this.splitKeyValue(pair);
                if (!key || !value) {
                    this.log(`无效的键值对: ${pair}`, LogLevel.DEBUG);
                    return;
                }
                
                const cleanKey = key.replace(/"/g, '').trim();
                
                let cleanValue = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                this.log(`清理后的值: ${cleanValue}`, LogLevel.DEBUG);
                
                if (cleanValue.startsWith('([') && cleanValue.endsWith('])')) {
                    result[cleanKey] = this.parseLPCMapping(cleanValue);
                } else if (cleanValue.startsWith('({') && cleanValue.endsWith('})')) {
                    result[cleanKey] = this.parseLPCArray(cleanValue);
                } else {
                    result[cleanKey] = this.parseBasicValue(cleanValue);
                }
            });
            
            return result;
            
        } catch (error) {
            this.log(`解析LPC映射出错: ${error}`, LogLevel.ERROR);
            return content;
        }
    }

    private parseLPCArray(content: string): any[] {
        try {
            content = content.substring(2, content.length - 2);
            
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            this.log(`LPC数组清理注释后的内容: ${content}`, LogLevel.DEBUG);
            
            const elements = this.splitArrayElements(content);
            
            return elements.map(element => {
                element = element.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                this.log(`处理数组元素: ${element}`, LogLevel.DEBUG);
                
                if (element.startsWith('([') && element.endsWith('])')) {
                    return this.parseLPCMapping(element);
                } else {
                    return this.parseBasicValue(element);
                }
            });
            
        } catch (error) {
            this.log(`解析LPC数组出错: ${error}`, LogLevel.ERROR);
            return [];
        }
    }

    private parseBasicValue(value: string): any {
        value = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        this.log(`处理基本值: ${value}`, LogLevel.DEBUG);
        
        if (value.endsWith(',')) {
            value = value.slice(0, -1).trim();
        }
        
        if (/^-?\d+$/.test(value)) {
            return parseInt(value);
        }
        if (/^-?\d*\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        
        if (value.startsWith('"') && value.endsWith('"')) {
            return value.slice(1, -1);
        }
        
        return value;
    }

    private splitPairs(content: string): string[] {
        const pairs: string[] = [];
        let currentPair = '';
        let bracketCount = 0;
        let inString = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                }
            }
            
            if (char === ',' && bracketCount === 0 && !inString) {
                if (currentPair.trim()) {
                    pairs.push(currentPair.trim());
                }
                currentPair = '';
            } else {
                currentPair += char;
            }
        }
        
        if (currentPair.trim()) {
            pairs.push(currentPair.trim());
        }
        
        return pairs;
    }

    private splitArrayElements(content: string): string[] {
        const elements: string[] = [];
        let currentElement = '';
        let bracketCount = 0;
        let inString = false;
        
        for (let i = 0; i < content.length; i++) {
            const char = content[i];
            
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                }
            }
            
            if (char === ',' && bracketCount === 0 && !inString) {
                if (currentElement.trim()) {
                    elements.push(currentElement.trim());
                }
                currentElement = '';
            } else {
                currentElement += char;
            }
        }
        
        if (currentElement.trim()) {
            elements.push(currentElement.trim());
        }
        
        return elements;
    }

    private splitKeyValue(pair: string): [string, string] {
        let colonIndex = -1;
        let inString = false;
        let bracketCount = 0;
        
        for (let i = 0; i < pair.length; i++) {
            const char = pair[i];
            
            if (char === '"' && pair[i - 1] !== '\\') {
                inString = !inString;
            }
            
            if (!inString) {
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                } else if (char === ':' && bracketCount === 0) {
                    colonIndex = i;
                    break;
                }
            }
        }
        
        if (colonIndex === -1) {
            return [pair, ''];
        }
        
        const key = pair.substring(0, colonIndex).trim();
        const value = pair.substring(colonIndex + 1).trim();
        return [key, value];
    }

    private processMessageBuffer() {
        if (this.messageBuffer.length > 0) {
            const messages = this.messageBuffer.slice();
            this.messageBuffer = [];
            messages.forEach(msg => this.processMessage(msg));
        }
    }

    private initMessageBuffer() {
        this.bufferTimer = setInterval(() => {
            this.processMessageBuffer();
        }, this.BUFFER_FLUSH_INTERVAL);
    }

    private encodeMessage(message: string): Buffer {
        try {
            const encodedMessage = iconv.encode(message + '\n', this.encoding);
            this.log(`消息编码(${this.encoding}): ${message}`, LogLevel.DEBUG);
            return encodedMessage;
        } catch (error) {
            this.log(`消息编码失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    public async sendCustomCommand(command: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('未连接到服务器');
        }
        if (!this.isLoggedIn()) {
            throw new Error('未登录角色');
        }

        try {
            const buffer = this.encodeMessage(command);
            this.socket?.write(buffer);
            this.log(`发送自定义命令: ${command}`, LogLevel.INFO);
        } catch (error) {
            this.log(`发送自定义命令失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    public async sendEvalCommand(code: string): Promise<void> {
        await this.sendCustomCommand(`eval return ${code}`);
    }

    public async sendRestartCommand(): Promise<void> {
        await this.sendCustomCommand('shutdown');
    }

    dispose() {
        if (this.bufferTimer) {
            clearInterval(this.bufferTimer);
        }
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.diagnosticCollection) {
            this.diagnosticCollection.dispose();
            this.diagnosticCollection = null;
        }
    }

    private showCompileError(mudPath: string, line: number, message: string) {
        try {
            const config = this.configManager.getConfig();
            const rootPath = config.rootPath;
            
            const localPath = path.join(rootPath, mudPath);
            const fileUri = vscode.Uri.file(localPath);

            const lineNumber = line - 1;

            const range = new vscode.Range(
                new vscode.Position(lineNumber, 0),
                new vscode.Position(lineNumber, Number.MAX_VALUE)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                message,
                vscode.DiagnosticSeverity.Error
            );

            if (!this.diagnosticCollection) {
                this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lpc');
            }
            this.diagnosticCollection.set(fileUri, [diagnostic]);

            vscode.workspace.openTextDocument(fileUri).then(doc => {
                vscode.window.showTextDocument(doc).then(editor => {
                    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                });
            });
        } catch (error) {
            this.log(`显示编译错误失败: ${error}`, LogLevel.ERROR);
        }
    }

    private clearDiagnostics() {
        if (this.diagnosticCollection) {
            this.diagnosticCollection.clear();
        }
    }

    private showDiagnostics(filePath: string, line: number, message: string) {
        try {
            // 将 MUD 路径转换为本地文件路径
            const localPath = this.convertToLocalPath(filePath);
            if (!localPath) {
                this.log(`无法转换文件路径: ${filePath}`, LogLevel.ERROR);
                return;
            }

            const uri = vscode.Uri.file(localPath);
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(line, 0, line, 100),  // 整行标记为错误
                message,
                vscode.DiagnosticSeverity.Error
            );

            this.diagnosticCollection?.set(uri, [diagnostic]);
        } catch (error) {
            this.log(`显示诊断信息失败: ${error}`, LogLevel.ERROR);
        }
    }

    private convertToLocalPath(mudPath: string): string | null {
        try {
            // 移除开头的斜杠
            const relativePath = mudPath.startsWith('/') ? mudPath.substring(1) : mudPath;
            // 获取工作区根目录
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                return null;
            }
            // 组合完整路径
            return vscode.Uri.joinPath(vscode.Uri.file(workspaceRoot), relativePath).fsPath;
        } catch (error) {
            this.log(`转换文件路径失败: ${error}`, LogLevel.ERROR);
            return null;
        }
    }

    // 添加命令发送前的状态检查
    private checkState(): boolean {
        this.log(`发送命令前状态检查:`, LogLevel.DEBUG);
        this.log(`- 连接状态: ${this.connected}`, LogLevel.DEBUG);
        this.log(`- 登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
        
        if (!this.isConnected()) {
            this.log('服务器未连接，无法发送命令', LogLevel.ERROR);
            vscode.window.showErrorMessage('请先连接到服务器');
            return false;
        }
        if (!this.isLoggedIn()) {
            this.log('角色未登录，无法发送命令', LogLevel.ERROR);
            vscode.window.showErrorMessage('请先登录');
            return false;
        }
        return true;
    }

    // eval命令
    public async eval(code: string) {
        if (!this.checkState()) {
            return;
        }
        this.log(`发送eval命令: ${code}`, LogLevel.DEBUG);
        this.sendCommand(`eval ${code}`, 'Eval命令');
    }
} 
