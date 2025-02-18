import * as net from 'net';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LogLevel } from './logManager';
import * as path from 'path';
import * as fs from 'fs';
import { ButtonProvider } from './buttonProvider';
import * as iconv from 'iconv-lite';

interface MessageOutput {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
}

interface MessageChannels {
    debug: MessageOutput;
    server: MessageOutput;
}

export class TcpClient {
    private socket: net.Socket | null = null;
    private connected: boolean = false;
    private loggedIn: boolean = false;
    private versionVerified: boolean = false;
    private isFirstData: boolean = true;
    private channels: MessageChannels;
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

    constructor(
        channels: MessageChannels,
        buttonProvider: ButtonProvider,
        messageProvider: any
    ) {
        this.channels = channels;
        this.buttonProvider = buttonProvider;
        this.messageProvider = messageProvider;
        this.config = vscode.workspace.getConfiguration('gameServerCompiler');
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gameServerCompiler.connection')) {
                this.config = vscode.workspace.getConfiguration('gameServerCompiler');
            }
        });
        this.initSocket();
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
        
        // 读取编码配置
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

        let buffer = Buffer.alloc(0);
        
        this.socket.on('data', (data) => {
          try {
              this.log('收到数据'+data, LogLevel.DEBUG);
                // 将收到的数据添加到buffer
                buffer = Buffer.concat([buffer, data]);
                
                // 使用配置的编码解码数据
                const decodedData = this.decodeData(buffer);
                
                // 检查是否有完整的消息(以\n结尾)
                if (decodedData.endsWith('\n')) {
                    // 分割消息
                    const messages = decodedData.split('\n');
                    
                    // 清空buffer
                    buffer = Buffer.alloc(0);
                    
                    // 处理每条完整的消息
                    for (let message of messages) {
                        if (message) { // 忽略空消息
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
                // 如果消息不完整，继续等待更多数据
            } catch (error) {
                this.log(`消息处理错误: ${error}`, LogLevel.ERROR);
                buffer = Buffer.alloc(0);
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
        
        // 1. 处理RGB颜色代码 (rgbs)
        result = result.replace(/\x1b\[f#[0-9a-fA-F]{6}m/g, '');
        
        // 2. 处理基本颜色代码 (30-37)
        result = result.replace(/\x1b\[3[0-7]m/g, '');
        
        // 3. 处理高亮颜色代码 (1;30-1;37)
        result = result.replace(/\x1b\[1;3[0-7]m/g, '');
        
        // 4. 处理背景色代码 (40-47)
        result = result.replace(/\x1b\[4[0-7]m/g, '');
        
        // 5. 处理高亮背景色代码 (41;1-47;1)
        result = result.replace(/\x1b\[4[0-7];1m/g, '');
        
        // 6. 处理特殊控制代码
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
        
        // 7. 处理可能的裸露ESC字符
        result = result.replace(/\x1b/g, '');
        
        return result;
    }

    private processMessage(message: string) {
        try {

            // 如果正在收集MUY消息
            if (this.isCollectingMuy) {
                this.muyBuffer += message;
                
                // 检查是否有结束标记
                if (this.muyBuffer.includes('║')) {
                    const endIndex = this.muyBuffer.indexOf('║') + 1;
                    const completeMessage = this.muyBuffer.substring(0, endIndex);
                    
                    // 提取MUY到║之间的所有内容
                    const content = completeMessage.substring(completeMessage.indexOf('MUY') + 3, completeMessage.indexOf('║'));
                    this.log(`提取的原始内容: ${content}`, LogLevel.DEBUG);
                    
                    // 清理所有注释和颜色代码
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
                    
                    // 重置MUY消息状态
                    this.muyBuffer = '';
                    this.isCollectingMuy = false;
                    
                    // 处理剩余的消息
                    const remainingMessage = completeMessage.substring(endIndex);
                    if (remainingMessage.length > 0) {
                        this.processMessage(remainingMessage);
                    }
                }
                return;
            }
            
            // 检查是否是新的MUY消息
            if (message.includes(this.ESC + 'MUY')) {
                const muyStart = message.indexOf(this.ESC + 'MUY');
                this.isCollectingMuy = true;
                this.muyBuffer = message.substring(muyStart);
                
                // 如果第一段就包含结束标记,立即处理
                if (this.muyBuffer.includes('║')) {
                    this.processMessage(this.muyBuffer);
                }
                return;
            }
            
            // 只有在不收集MUY消息时才处理其他类型的消息
            if (!this.isCollectingMuy) {
                // 检查是否是协议消息
                const protocolMatch = message.match(/^\x1b(\d{3})(.*)/);
                if (protocolMatch) {
                    const [, protocolCode, content] = protocolMatch;
                    this.processProtocolMessage(protocolCode, content);
                    return;
                }
                
                // 处理普通消息
                this.processNormalMessage(message);
            }
        } catch (error) {
            this.log(`处理消息失败: ${error}`, LogLevel.ERROR);
        }
    }

    private processNormalMessage(message: string) {
        try {
            // 清理颜色代码
            const cleanedMessage = this.cleanColorCodes(message);
            
            // 记录处理后的消息
            this.log(`处理普通消息: ${cleanedMessage}`, LogLevel.DEBUG);

            // 检查特定消息
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
                this.log(errorMsg, LogLevel.ERROR, true);
                this.stopReconnect();
                this._isReconnecting = false;
                this.reconnectAttempts = this.maxReconnectAttempts;
                this.disconnect();
            } else if (cleanedMessage.trim()) {  // 处理所有非空消息
                this.appendToGameLog(cleanedMessage);
                
                // 选择合适的图标
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
                
                // 显示消息到消息面板
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
        
        if (code != '012') {
            this.log(`==== 处理协议消息 ====`, LogLevel.DEBUG);
            this.log(`协议代码: ${code}`, LogLevel.DEBUG);
            this.log(`内容: ${cleanedContent}`, LogLevel.DEBUG);
        }
        switch(code) {
            case '012':
                break;
            case '000':
                if (cleanedContent === '0007') {
                    this.log('收到登录成功信号', LogLevel.INFO);
                    this.setLoginState(true);
                }
                break;
            case '015':
                if (cleanedContent.includes('密码错误') || cleanedContent.includes('账号不存在')) {
                    this.log(cleanedContent, LogLevel.ERROR, true);
                    this.channels.server.appendLine(`❌ ${cleanedContent}`);
                    this.disconnect();
                } else if (cleanedContent.includes('更新中') || cleanedContent.includes('维护中')) {
                    this.log(cleanedContent, LogLevel.INFO, true);
                    this.channels.server.appendLine(`🔧 ${cleanedContent}`);
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
                    this.channels.server.appendLine(`${icon}${cleanedContent}`);
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
            this.channels.debug.appendLine(`${prefix} ${cleanMessage}`);

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
                this.channels.server.appendLine(`${icon}${content}`);
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

    public async connect(host: string, port: number): Promise<void> {
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

                    // 检查是否是本地回环地址
                    const isLocalhost = host === 'localhost' || host === '127.0.0.1';
                    
                    // 如果是本地回环地址，尝试使用实际IP
                    if (isLocalhost) {
                        this.log('检测到本地回环地址，尝试使用实际IP', LogLevel.INFO);
                        // 使用实际IP连接
                        this.socket?.connect(port, '127.0.0.1', () => {
                            this.log('Socket连接成功', LogLevel.INFO);
                            this.setConnectionState(true);
                            resolve();
                        });
                    } else {
                        // 使用提供的地址连接
                        this.socket?.connect(port, host, () => {
                            this.log('Socket连接成功', LogLevel.INFO);
                            this.setConnectionState(true);
                            resolve();
                        });
                    }
                });

                // 使用Promise.race来处理超时
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
            
            // 使用encodeData进行编码转换
            const encodedKey = this.encodeData(key + '\n');
            this.socket?.write(encodedKey, () => {
                this.log('验证密钥发送完成', LogLevel.DEBUG);
            });
        } catch (error) {
            const errorMsg = `发送验证密钥失败: ${error}`;
            this.log(errorMsg, LogLevel.ERROR, true);
            this.disconnect();
        }
    }

    private async login() {
        try {
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (!fs.existsSync(configPath)) {
                throw new Error('配置文件不存在，请先配置muy-lpc-update.json');
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.username || !config.password) {
                throw new Error('用户名或密码未配置，请在muy-lpc-update.json中配置');
            }

            this.log('开始登录...', LogLevel.INFO);
            this.log(`当前状态: connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.INFO);
            
            // 根据loginWithEmail配置决定登录信息格式
            const loginString = config.loginWithEmail ? 
                `${config.username}║${config.password}║zzzz║zzzz@qq.com\n` :
                `${config.username}║${config.password}║zzzz\n`;
            
            this.log(`发送登录信息: ${loginString}`, LogLevel.INFO);
            
            // 使用encodeData进行编码转换
            const encodedData = this.encodeData(loginString);
            this.socket?.write(encodedData, () => {
                this.log('登录信息发送完成', LogLevel.DEBUG);
            });
        } catch (error) {
            const errorMsg = `登录失败: ${error}`;
            this.log(errorMsg, LogLevel.ERROR, true);
            this.disconnect();
        }
    }

    private sendCommand(command: string, commandName: string = '命令') {
        this.log(`发送命令前状态检查:`, LogLevel.DEBUG);
        this.log(`- 连接状态: ${this.connected}`, LogLevel.DEBUG);
        this.log(`- 登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
        this.log(`- 当前编码: ${this.encoding}`, LogLevel.DEBUG);

        if (!this.connected || !this.socket) {
            this.log('错误: 未连接到服务器', LogLevel.ERROR);
            return false;
        }

        if (!this.loggedIn) {
            this.log('错误: 未登录到服务器', LogLevel.ERROR);
            return false;
        }

        try {
            this.log(`发送${commandName}: ${command}`, LogLevel.DEBUG);
            
            // 使用encodeData进行编码转换
            const encodedCommand = this.encodeData(command + '\n');
            this.socket.write(encodedCommand);
            
            this.log(`${commandName}发送完成`, LogLevel.DEBUG);
            return true;
        } catch (error) {
            this.log(`发送${commandName}失败: ${error}`, LogLevel.ERROR);
            return false;
        }
    }

    sendCustomCommand(command: string) {
        this.sendCommand(command, '自定义命令');
    }

    sendEvalCommand(code: string) {
        this.sendCommand(`eval return ${code}`, 'Eval命令');
    }

    sendRestartCommand() {
        this.sendCommand('shutdown', '重启命令');
    }

    async sendUpdateCommand(filePath: string) {
        this.log(`准备发送更新命令，文件路径: ${filePath}`, LogLevel.INFO);
        
        if (!this.connected || !this.socket) {
            this.log('错误: 未连接到服务器', LogLevel.ERROR);
            vscode.window.showErrorMessage('请先连接到服务器');
            return;
        }

        if (!this.loggedIn) {
            this.log('错误: 未登录', LogLevel.ERROR);
            vscode.window.showErrorMessage('请先登录');
            return;
        }

        try {
            const config = vscode.workspace.getConfiguration('gameServerCompiler');
            const showDetails = config.get<boolean>('compile.showDetails', true);
            const timeout = config.get<number>('compile.timeout', 30000);

            const filePathWithoutExt = filePath.replace(/\.[^/.]+$/, "");
            const command = `update ${filePathWithoutExt}`;
            
            if (showDetails) {
                this.log(`发送更新命令: ${command}`, LogLevel.INFO);
            }

            const compilePromise = new Promise<void>((resolve, reject) => {
                try {
                    this.socket?.write(`${command}\n`, () => {
                        if (showDetails) {
                            this.log('更新命令发送完成', LogLevel.DEBUG);
                        }
                        resolve();
                    });
                } catch (error) {
                    reject(error);
                }
            });

            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('编译超时')), timeout);
            });

            // 等待编译完成或超时
            await Promise.race([compilePromise, timeoutPromise]);
            
            return true;
        } catch (error) {
            const errorMessage = `发送更新命令失败: ${error}`;
            this.log(errorMessage, LogLevel.ERROR);
            vscode.window.showErrorMessage(errorMessage);
            return false;
        }
    }

    async sendCompileCommand(command: string, showDetails: boolean = true) {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const timeout = config.get<number>('compile.timeout', 30000);

        try {
            if (showDetails) {
                this.log(`发送编译命令: ${command}`, LogLevel.INFO);
            }

            // 创建编译Promise
            const compilePromise = new Promise<void>((resolve, reject) => {
                try {
                    this.sendCommand(command, '编译命令');
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });

            // 创建超时Promise
            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('编译超时')), timeout);
            });

            // 等待编译完成或超时
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
        
        // 停止所有重连尝试
        this.stopReconnect();
        
        // 清理socket
        if (this.socket) {
            this.log('正在关闭socket连接...', LogLevel.INFO);
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        
        // 重置所有状态
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
        
        // 重置MUY消息状态
        this.isCollectingMuy = false;
        this.muyBuffer = '';
        
        // 清理所有定时器
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        
        // 更新UI状态
        this.buttonProvider?.updateConnectionState(false);
        this.buttonProvider?.updateButtonState(false);
        
        // 更新连接状态
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
        // 这些消息只会写入日志，不会弹窗
        this.log('==== 命令发送状态检查 ====', LogLevel.INFO);
        this.log(`命令: ${commandName} (${command})`, LogLevel.INFO);
        this.log(`连接状态: ${this.connected}`, LogLevel.INFO);
        this.log(`登录状态: ${this.loggedIn}`, LogLevel.INFO);
    }

    // 修改handleStatusChange方法
    private handleStatusChange(status: 'connected' | 'disconnected' | 'loggedIn', message: string) {
        let showNotification = false;
        
        if (status === 'connected' && this.isFirstConnect) {
            showNotification = true;
            this.isFirstConnect = false;
            // 只更新连接状态
            this.buttonProvider?.updateConnectionState(true);
        } 
        else if (status === 'disconnected') {
            this.connected = false;
            showNotification = true;
            this.isFirstConnect = true;
            this.isFirstLogin = true;
            // 断开连接时更新所有状态
            this.buttonProvider?.updateConnectionState(false);
            this.buttonProvider?.updateButtonState(false);
            this.setLoginState(false);
            this.setConnectionState(false);
        }
        
        if (showNotification) {
            this.log(message, LogLevel.INFO, showNotification);
        }
    }

    // 修改 appendToGameLog 方法
    private ensureUTF8(text: string): string {
        try {
            if (this.encoding.toUpperCase() === 'GBK') {
                // 检测文本是否已经是UTF8
                const isUTF8 = text === iconv.decode(iconv.encode(text, 'UTF8'), 'UTF8');
                if (!isUTF8) {
                    // 如果不是UTF8，则进行转换
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
            // 确保消息是UTF8编码
            const utf8Message = this.ensureUTF8(message);
            
            // 调试面板显示详细信息
            this.channels.debug.appendLine('================================');
            this.channels.debug.appendLine(`游戏消息: ${utf8Message}`);
            this.channels.debug.appendLine(`消息长度: ${utf8Message.length}`);
            this.channels.debug.appendLine(`接收时间: ${new Date().toISOString()}`);
            this.channels.debug.appendLine('消息分析:');
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
        
        // 检查是否是常见错误
        if (error.message.includes('ECONNREFUSED')) {
            this.log('服务器拒绝连接，请检查服务器地址和端口是否正确', LogLevel.ERROR, true);
        } else if (error.message.includes('ETIMEDOUT')) {
            this.log('连接超时，请检查网络连接和服务器状态', LogLevel.ERROR, true);
        } else if (error.message.includes('ENOTFOUND')) {
            this.log('找不到服务器，请检查服务器地址是否正确', LogLevel.ERROR, true);
        } else {
            this.log(`连接错误: ${error.message}`, LogLevel.ERROR, true);
        }

        this.handleDisconnect();
    }

    // 新增：统一的状态管理方法
    private async setConnectionState(isConnected: boolean) {
        if (this.connected !== isConnected) {
            this.connected = isConnected;
            if (!isConnected) {
                this.setLoginState(false);
            }
            
            this.log(`更新连接状态为: ${isConnected}`, LogLevel.INFO);
            
            // 确保按钮状态更新
            if (this.buttonProvider) {
                this.buttonProvider.updateConnectionState(isConnected);
            }
            
            // 更新命令上下文
            await vscode.commands.executeCommand('setContext', 'gameServerCompiler.isConnected', isConnected);
            
            // 更新配置
            const config = vscode.workspace.getConfiguration('gameServerCompiler');
            await config.update('isConnected', isConnected, true);
            
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
        
        // 确保所有状态被重置
        this.setConnectionState(false);
        this.setLoginState(false);
        this.versionVerified = false;
        this.isFirstData = true;
        
        // 重置MUY消息状态
        this.isCollectingMuy = false;
        this.muyBuffer = '';
        
        // 清理socket
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
            this.socket = null;
        }
        
        // 重置重连状态
        this._isReconnecting = false;
        this.reconnectAttempts = 0;
        
        // 清理定时器
        if (this.reconnectTimer) {
            clearInterval(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        
        // 确保按钮被禁用
        if (this.buttonProvider) {
            this.buttonProvider.updateConnectionState(false);
            this.buttonProvider.updateButtonState(false);
        }
        
        this.log('==== 断开连接处理完成 ====', LogLevel.INFO);
        
        // 如果之前是连接状态，且不是主动断开，则尝试重连
        if (wasConnected && !this._isReconnecting) {
            this.startReconnect();
        }
    }

    // 新增方法：统一设置登录状态
    private async setLoginState(isLoggedIn: boolean) {
        const prevState = this.loggedIn;
        this.loggedIn = isLoggedIn;
        
        this.log(`==== 设置登录状态 ====`, LogLevel.DEBUG);
        this.log(`之前状态: ${prevState}`, LogLevel.DEBUG);
        this.log(`新状态: ${isLoggedIn}`, LogLevel.DEBUG);
        this.log(`连接状态: ${this.connected}`, LogLevel.DEBUG);
        
        vscode.commands.executeCommand('setContext', 'gameServerCompiler.isLoggedIn', isLoggedIn);
        
        if (isLoggedIn && !prevState) {
            // 登录成功时更新所有状态
            this.setConnectionState(true);
            this.buttonProvider?.updateConnectionState(true);
            this.buttonProvider?.updateButtonState(true);
            
            // 触发状态变化处理
            this.handleStatusChange('loggedIn', '角色登录成功');
        } else if (!isLoggedIn && prevState) {
            // 登出时禁用按钮
            this.buttonProvider?.updateButtonState(false);
            this.log('角色已登出', LogLevel.INFO);
        }
    }

    // 修改 TcpClient 类中的 updateEncoding 方法
    private updateEncoding() {
        try {
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                
                // 检查并设置默认配置
                let needsUpdate = false;
                
                // 检查编码配置
                if (!config.encoding) {
                    config.encoding = 'UTF8';
                    needsUpdate = true;
                    this.log('未找到编码配置，已设置为默认UTF8编码', LogLevel.INFO);
                }
                
                // 检查loginWithEmail配置
                if (config.loginWithEmail === undefined) {
                    config.loginWithEmail = false;
                    needsUpdate = true;
                    this.log('未找到登录邮箱配置，已设置为默认false', LogLevel.INFO);
                }
                
                // 如果有配置更新，保存到文件
                if (needsUpdate) {
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
                    this.log('配置文件已更新', LogLevel.INFO);
                }
                
                const newEncoding = config.encoding.toUpperCase();
                if (this.encoding !== newEncoding) {
                    this.encoding = newEncoding;
                    this.log(`编码设置已更新: ${this.encoding}`, LogLevel.INFO);
                }
                
                // 监听配置文件变化
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
        try {
            // 记录原始数据的十六进制形式用于调试
            if (this.encoding.toUpperCase() === 'GBK') {
                // 使用GBK解码数据
                const text = iconv.decode(data, 'GBK');
                this.log(`GBK解码后的文本: ${text}`, LogLevel.DEBUG);
                
                // 将GBK文本转换为UTF8
                const utf8Buffer = iconv.encode(text, 'UTF8');
                const utf8Text = iconv.decode(utf8Buffer, 'UTF8');
                this.log(`转换为UTF8后的文本: ${utf8Text}`, LogLevel.DEBUG);
                
                return utf8Text;
            }
            // 如果是UTF8编码，直接解码
            const text = iconv.decode(data, 'UTF8');
            return text;
        } catch (error) {
            this.log(`解码数据失败: ${error}`, LogLevel.ERROR);
            return data.toString();
        }
    }

    private encodeData(text: string): Buffer {
        try {
            if (this.encoding.toUpperCase() === 'GBK') {
                // 如果当前是GBK模式，需要将UTF8文本转换为GBK
                const gbkBuffer = iconv.encode(text, 'GBK');
                this.log(`文本已编码为GBK，长度: ${gbkBuffer.length}字节`, LogLevel.DEBUG);
                return gbkBuffer;
            }
            
            // 如果是UTF8模式，直接编码
            const buffer = iconv.encode(text, 'UTF8');
            this.log(`文本已编码为UTF8，长度: ${buffer.length}字节`, LogLevel.DEBUG);
            return buffer;
        } catch (error) {
            this.log(`编码失败: ${error}`, LogLevel.ERROR);
            return Buffer.from(text);
        }
    }

    private parseLPCMapping(content: string): any {
        // 如果不是映射格式,直接返回
        if (!content.trim().startsWith('([') || !content.trim().endsWith('])')) {
            return content.trim();
        }

        try {
            // 移除外层括号
            content = content.substring(content.indexOf('([') + 2, content.lastIndexOf('])'));
            
            // 清理注释
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            this.log(`LPC映射清理注释后的内容: ${content}`, LogLevel.DEBUG);
            
            // 分割键值对
            const pairs = this.splitPairs(content);
            this.log(`分割的键值对数量: ${pairs.length}`, LogLevel.DEBUG);
            
            // 构建结果对象
            const result: any = {};
            
            // 处理每个键值对
            pairs.forEach(pair => {
                // 清理键值对中的注释
                pair = pair.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                this.log(`处理键值对: ${pair}`, LogLevel.DEBUG);
                
                const [key, value] = this.splitKeyValue(pair);
                if (!key || !value) {
                    this.log(`无效的键值对: ${pair}`, LogLevel.DEBUG);
                    return;
                }
                
                // 移除键的引号
                const cleanKey = key.replace(/"/g, '').trim();
                
                // 清理值中的注释
                let cleanValue = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
                this.log(`清理后的值: ${cleanValue}`, LogLevel.DEBUG);
                
                // 递归处理值
                if (cleanValue.startsWith('([') && cleanValue.endsWith('])')) {
                    // 如果值是映射,递归解析
                    result[cleanKey] = this.parseLPCMapping(cleanValue);
                } else if (cleanValue.startsWith('({') && cleanValue.endsWith('})')) {
                    // 如果值是数组,解析数组
                    result[cleanKey] = this.parseLPCArray(cleanValue);
                } else {
                    // 处理基本类型
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
            // 移除外层括号
            content = content.substring(2, content.length - 2);
            
            // 清理注释
            content = content.replace(/\/\*[\s\S]*?\*\//g, '');
            this.log(`LPC数组清理注释后的内容: ${content}`, LogLevel.DEBUG);
            
            // 分割数组元素
            const elements = this.splitArrayElements(content);
            
            // 处理每个元素
            return elements.map(element => {
                // 清理元素中的注释
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
        // 清理注释
        value = value.replace(/\/\*[\s\S]*?\*\//g, '').trim();
        this.log(`处理基本值: ${value}`, LogLevel.DEBUG);
        
        // 移除尾部逗号
        if (value.endsWith(',')) {
            value = value.slice(0, -1).trim();
        }
        
        // 尝试转换数字
        if (/^-?\d+$/.test(value)) {
            return parseInt(value);
        }
        if (/^-?\d*\.\d+$/.test(value)) {
            return parseFloat(value);
        }
        
        // 处理字符串(移除引号)
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
            
            // 处理字符串
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            // 只在不在字符串中时计算括号
            if (!inString) {
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                }
            }
            
            // 只在不在字符串中且括号计数为0时处理逗号
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
            
            // 处理字符串
            if (char === '"' && content[i - 1] !== '\\') {
                inString = !inString;
            }
            
            // 只在不在字符串中时计算括号
            if (!inString) {
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                }
            }
            
            // 只在不在字符串中且括号计数为0时处理逗号
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
        
        // 查找分隔键值对的冒号
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
}
