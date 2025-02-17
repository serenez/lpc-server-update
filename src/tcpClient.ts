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
                // 将收到的数据添加到buffer
                buffer = Buffer.concat([buffer, data]);
                
                // 根据配置的编码解码数据
                let decodedData = '';
                if (this.encoding.toUpperCase() === 'GBK') {
                    decodedData = iconv.decode(buffer, 'gbk');
                } else {
                    decodedData = buffer.toString('utf8');
                }
                
                if (decodedData.length > 0) {
                    const messages = decodedData.split('\n');
                    // 如果最后一个消息不完整，保留在buffer中
                    if (!decodedData.endsWith('\n')) {
                        buffer = this.encoding.toUpperCase() === 'GBK' ? 
                            iconv.encode(messages.pop() || '', 'gbk') :
                            Buffer.from(messages.pop() || '');
                    } else {
                        buffer = Buffer.alloc(0);
                    }

                    for (const message of messages) {
                        const trimmedMessage = message.trim();
                        if (trimmedMessage) {
                            this.processMessage(trimmedMessage);
                        }
                    }
                }
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
        
        // 1. 处理RGB颜色代码
        result = result.replace(/\x1b\[f#[0-9a-fA-F]{6}m/g, '');
        
        // 2. 处理基础颜色代码
        const colorCodes = [
            // 普通前景色 [30m-[37m
            '\\[3[0-7]m',
            // 高亮前景色 [1;30m-[1;37m
            '\\[1;3[0-7]m',
            // 普通背景色 [40m-[47m
            '\\[4[0-7]m',
            // 高亮背景色 [41;1m-[47;1m
            '\\[4[0-7];1m',
            // 重置
            '\\[2;37;0m',
            // 其他控制代码
            '\\[1m',      // BOLD
            '\\[2J',      // CLR
            '\\[H',       // HOME
            '\\[s',       // SAVEC
            '\\[u',       // REST
            '\\[5m',      // BLINK
            '\\[4m',      // U
            '\\[7m',      // REV
            '\\[1,7m',    // HIREV
            '\\[9m',      // DENGKUAN
            '\\[r',       // UNFR
            '\\[2;25r',   // FRTOP
            '\\[1;24r'    // FRBOT
        ];
        
        // 将所有颜色代码替换为空
        colorCodes.forEach(code => {
            result = result.replace(new RegExp('\x1b' + code, 'g'), '');
        });
        
        // 3. 处理可能的裸露ESC字符
        result = result.replace(/\x1b/g, '');
        
        return result;
    }

    private processMessage(message: string) {
        // 检查是否包含新的MUY消息头
        if (message.includes(this.ESC + 'MUY')) {
            // 重置状态,开始新的消息收集
            const muyStart = message.indexOf(this.ESC + 'MUY');
            this.isCollectingMuy = true;
            const newMessage = message.substring(muyStart);
            this.log(`开始收集新的MUY消息: ${newMessage}`, LogLevel.DEBUG);
            
            // 检查当前消息是否包含结束标记
            if (newMessage.includes('║')) {
                const endIndex = newMessage.indexOf('║') + 1;
                const completeMessage = newMessage.substring(0, endIndex);
                this.log(`处理完整的MUY消息: ${completeMessage}`, LogLevel.DEBUG);
                this.processMuyMessage(completeMessage);
                
                // 重置状态
                this.muyBuffer = '';
                this.isCollectingMuy = false;
                
                // 处理剩余的消息
                const remainingMessage = newMessage.substring(endIndex);
                if (remainingMessage.length > 0) {
                    this.log(`处理剩余消息: ${remainingMessage}`, LogLevel.DEBUG);
                    this.processNormalMessage(remainingMessage);
                }
            } else {
                this.muyBuffer = newMessage;
            }
            return;
        }
        
        // 如果正在收集MUY消息
        if (this.isCollectingMuy) {
            this.muyBuffer += message;
            this.log(`添加到MUY缓冲区: ${this.muyBuffer}`, LogLevel.DEBUG);
            
            // 检查是否收集完整
            if (this.muyBuffer.includes('║')) {
                const endIndex = this.muyBuffer.indexOf('║') + 1;
                const completeMessage = this.muyBuffer.substring(0, endIndex);
                this.log(`MUY消息收集完成: ${completeMessage}`, LogLevel.DEBUG);
                this.processMuyMessage(completeMessage);
                
                // 重置状态
                this.muyBuffer = '';
                this.isCollectingMuy = false;
                
                // 处理剩余的消息
                const remainingMessage = this.muyBuffer.substring(endIndex);
                if (remainingMessage.length > 0) {
                    this.log(`处理剩余消息: ${remainingMessage}`, LogLevel.DEBUG);
                    this.processNormalMessage(remainingMessage);
                }
            }
            return;
        }

        // 处理普通消息
        this.processNormalMessage(message);
    }

    private processNormalMessage(message: string) {
        // 先清理颜色代码
        const cleanedMessage = this.cleanColorCodes(message);
        
        if (message.startsWith(this.ESC)) {
            const protocolMatch = message.match(/^\x1b(\d{3})(.*)/);
            if (protocolMatch) {
                const [, protocolCode, content] = protocolMatch;
                this.processProtocolMessage(protocolCode, content);
            }
        } else {
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
            } else {
                this.appendToGameLog(cleanedMessage);
                let icon = '';
                if (cleanedMessage.includes('成功')) {
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
                this.channels.server.appendLine(`${icon}${cleanedMessage}`);
            }
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

                    this.socket?.connect(port, host, () => {
                        this.log('Socket连接成功', LogLevel.INFO);
                        this.setConnectionState(true);
                        resolve();
                    });
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
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const fileConfig = JSON.parse(configData);
                if (fileConfig.serverKey) {
                    this.log(`从配置文件读取到serverKey`, LogLevel.INFO);
                    const key = `${this.sha1(fileConfig.serverKey)}\n`;
                    this.socket?.write(key);
                    this.log('发送版本验证密钥', LogLevel.INFO);
                    return;
                }
            }

            const errorMsg = '服务器密钥未配置，请在.vscode/muy-lpc-update.json中配置serverKey';
            this.log(errorMsg, LogLevel.ERROR, true);
            this.disconnect();
        } catch (error) {
            this.log(`读取或发送密钥失败: ${error}`, LogLevel.ERROR);
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
            
            const loginString = `${config.username}║${config.password}║zzzz\n`;
            this.log(`发送登录信息: ${config.username}║${config.password}║zzzz`, LogLevel.INFO);
            this.socket?.write(loginString, () => {
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
            this.log('错误: 未登录', LogLevel.ERROR);
            this.log(`当前状态: connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.ERROR);
            return false;
        }

        try {
            let data: Buffer;
            if (this.encoding.toUpperCase() === 'GBK') {
                data = iconv.encode(command + '\n', 'gbk');
            } else {
                data = Buffer.from(command + '\n', 'utf8');
            }
            
            this.log(`发送命令: ${command}`, LogLevel.INFO);
            this.socket.write(data);
            return true;
        } catch (error) {
            this.log(`发送命令失败: ${error}`, LogLevel.ERROR);
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
    private appendToGameLog(message: string) {
        if (message.trim()) {
            // 调试面板显示详细信息
            this.channels.debug.appendLine('================================');
            this.channels.debug.appendLine(`游戏消息: ${message}`);
            this.channels.debug.appendLine(`消息长度: ${message.length}`);
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

    // 添加新方法处理MUY消息
    private processMuyMessage(message: string) {
        try {
            // 提取MUY到║之间的所有内容
            const content = message.substring(message.indexOf('MUY') + 3, message.length - 1);
            
            // 清理颜色代码
            let cleanedContent = this.cleanColorCodes(content);

            // 清理注释 /* ... */
            cleanedContent = cleanedContent.replace(/\/\*.*?\*\//g, '');

            // 检查是否是映射格式
            if (cleanedContent.startsWith('([') && cleanedContent.endsWith('])')) {
                // 格式化映射内容
                const formattedContent = this.formatMapping(cleanedContent);
                
                // 显示格式化后的消息到消息面板
                if (this.messageProvider) {
                    this.messageProvider.addMessage(`<pre style="margin:0;white-space:pre-wrap;font-family:monospace;">${formattedContent}</pre>`);
                }
            } else {
                // 非映射格式,直接显示
                if (this.messageProvider) {
                    this.messageProvider.addMessage(cleanedContent);
                }
            }
            
        } catch (error) {
            this.log(`处理MUY消息出错: ${error}`, LogLevel.ERROR);
        }
    }

    // 添加格式化映射的方法
    private formatMapping(content: string, level: number = 0): string {
        try {
            // 基础缩进
            const indent = '  '.repeat(level);
            
            // 如果不是映射格式,直接返回
            if (!content.startsWith('([') || !content.endsWith('])')) {
                return content;
            }

            // 移除外层括号
            content = content.substring(2, content.length - 2);

            // 分割键值对
            const pairs: string[] = [];
            let currentPair = '';
            let bracketCount = 0;
            
            for (let i = 0; i < content.length; i++) {
                const char = content[i];
                if (char === '(' || char === '[') {
                    bracketCount++;
                } else if (char === ')' || char === ']') {
                    bracketCount--;
                }
                
                if (char === ',' && bracketCount === 0) {
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

            // 处理每个键值对
            const formattedPairs = pairs.map(pair => {
                const [key, value] = this.splitKeyValue(pair);
                const formattedKey = key.replace(/"/g, '');
                
                // 如果值是映射,递归处理
                if (value.startsWith('([') && value.endsWith('])')) {
                    return `${indent}${formattedKey}: ${this.formatMapping(value, level + 1)}`;
                }
                
                // 处理普通值
                return `${indent}${formattedKey}: ${value}`;
            });

            // 组合结果
            if (level === 0) {
                return `{\n${formattedPairs.join(',\n')}\n}`;
            } else {
                return `{\n${formattedPairs.join(',\n')}\n${indent}}`;
            }
            
        } catch (error) {
            this.log(`格式化映射出错: ${error}`, LogLevel.ERROR);
            return content;
        }
    }

    // 添加分割键值对的方法
    private splitKeyValue(pair: string): [string, string] {
        const colonIndex = pair.indexOf(':');
        if (colonIndex === -1) {
            return [pair, ''];
        }
        
        const key = pair.substring(0, colonIndex).trim();
        const value = pair.substring(colonIndex + 1).trim();
        return [key, value];
    }

    // 添加更新编码的方法
    private updateEncoding() {
        try {
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                this.encoding = config.encoding || 'UTF8';
                this.log(`更新编码设置: ${this.encoding}`, LogLevel.INFO);
            }
        } catch (error) {
            this.log(`读取编码配置失败: ${error}`, LogLevel.ERROR);
            this.encoding = 'UTF8';
        }
    }
}
