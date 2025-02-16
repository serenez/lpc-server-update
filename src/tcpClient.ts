import * as net from 'net';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LogLevel } from './logManager';
import * as path from 'path';
import * as fs from 'fs';

interface MessageOutput {
    appendLine(value: string): void;
    show(preserveFocus?: boolean): void;
}

export class TcpClient {
    private socket: net.Socket | null = null;
    private connected: boolean = false;
    private loggedIn: boolean = false;
    private versionVerified: boolean = false;  // 添加版本验证标志
    private isFirstData: boolean = true;  // 添加首次数据标记
    private outputChannel: MessageOutput;
    private buttonProvider: any;  // 添加ButtonProvider引用
    private reconnectTimer: NodeJS.Timeout | null = null;
    private lastHost: string = '';
    private lastPort: number = 0;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 10; // 最大重连次数
    private reconnectInterval: number = 5000;   // 重连间隔（毫秒）
    private _isReconnecting: boolean = false;
    private isFirstConnect = true;
    private isFirstLogin = true;
    private ESC = '\x1b';
    constructor(outputChannel: MessageOutput, buttonProvider: any) {
        this.outputChannel = outputChannel;
        this.buttonProvider = buttonProvider;  // 保存ButtonProvider引用
        this.initSocket();
    }

  private initSocket() {
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.destroy();
        }
        
        this.socket = new net.Socket();
        
        // 设置编码和保持连接
        this.socket.setEncoding('utf8');
        this.socket.setKeepAlive(true, 60000);
        this.socket.setNoDelay(true);
        
        this.socket.on('connect', () => {
            this.reconnectAttempts = 0;
            this.isFirstData = true;  // 连接时重置首次数据标记
          this.log('已连接到游戏服务器', LogLevel.INFO);
          
        });

        let buffer = '';  // 改用字符串缓冲
        this.socket.on('data', (data) => {
            try {
                // 将新数据添加到缓冲区
                buffer += data.toString();
                
                // 如果没有完整的消息，继续等待
                if (buffer[buffer.length - 1] !== '\n') {
                    this.log('数据不完整，等待更多数据...', LogLevel.DEBUG);
                    return;
                }

                // 分割消息并处理
                const messages = buffer.split('\n');
                // 保留未完成的消息
                buffer = messages.pop() || '';

                // 处理每条完整的消息
                for (const message of messages) {
                    if (!message.trim()) continue;
                    const trimmedMessage = message.trim();
                    
                    // 检查是否以ESC开头
                    if (trimmedMessage.startsWith(this.ESC)) {
                        // 使用正则提取ESC后的三位数字
                        const protocolMatch = trimmedMessage.match(/^\x1b(\d{3})(.*)/);
                        if (protocolMatch) {
                            const [, protocolCode, content] = protocolMatch;
                            
                            // 处理不同协议消息
                            switch(protocolCode) {
                                case '012': // HP信息，直接跳过
                                    continue;
                                    
                                case '000':
                                    if (content === '0007') {
                                        this.log('收到登录成功信号', LogLevel.INFO);
                                        this.loggedIn = true;
                                        this.handleStatusChange('loggedIn', '角色登录成功！');
                                    }
                                    continue;
                                    
                                default:
                                    continue;
                            }
                        }
                    }
                    // 处理非协议消息
                    else if (trimmedMessage === '版本验证成功') {
                        this.log('版本验证成功，开始登录', LogLevel.INFO);
                        this.login();
                        continue;
                    }
                    else if (trimmedMessage.includes('muy_update:')) {
                        const match = trimmedMessage.match(/muy_update:(.*)/);
                        if (match) {
                            const dependencyFile = match[1].trim();
                            this.log(`检测到依赖文件更新: ${dependencyFile}`, LogLevel.INFO);
                            this.sendUpdateCommand(dependencyFile);
                            continue;
                        }
                    }
                    else if (trimmedMessage.includes('ver1.2')) {
                        this.log('收到服务器连接成功信号', LogLevel.INFO);
                        this.connected = true;
                        this.handleStatusChange('connected', '服务器连接成功！');
                        this.sendKey();
                        continue;
                    }
                    else if (trimmedMessage.includes('客户端非法')) {
                        const errorMsg = '服务器验证失败：客户端非法。请检查服务器密钥配置是否正确。';
                        this.log(errorMsg, LogLevel.ERROR, true);
                        this.stopReconnect(); // 停止自动重连
                        this._isReconnecting = false; // 确保重连标志被重置
                        this.reconnectAttempts = this.maxReconnectAttempts; // 防止继续重连
                        this.disconnect(); // 断开连接
                        continue;
                    }
                    else {
                        this.appendToGameLog(trimmedMessage);
                    }
                }
            } catch (error) {
                this.log(`消息处理错误: ${error}`, LogLevel.ERROR);
                buffer = ''; // 清空缓冲区
            }
        });

        this.socket.on('error', (err) => {
            this.log(`连接错误: ${err.message}`, LogLevel.ERROR);
            this.handleConnectionError(err);
        });

        this.socket.on('close', () => {
            this.log('Socket关闭事件触发', LogLevel.DEBUG);
            this.handleDisconnect();
        });

        this.socket.on('end', () => {
            this.log('Socket结束事件触发', LogLevel.DEBUG);
        });
    }

    private processProtocolMessage(message: string) {
        // 从zjmud.h中定义的协议代码
        const protocols: { [key: string]: string } = {
            '000': 'SYSY',      // 系统消息
            '001': 'INPUTTXT',  // 输入文本
            '002': 'ZJTITLE',   // 标题
            '003': 'ZJEXIT',    // 出口
            '004': 'ZJLONG',    // 长消息
            '005': 'ZJOBIN',    // 对象进入
            '006': 'ZJBTSET',   // 按钮设置
            '007': 'ZJOBLONG',  // 对象长消息
            '008': 'ZJOBACTS',  // 对象动作
            '009': 'ZJOBACTS2', // 对象动作2
            '010': 'ZJYESNO',   // 是否选择
            '011': 'ZJMAPTXT',  // 地图文本
            '012': 'ZJHPTXT',   // HP文本
            '013': 'ZJMORETXT', // 更多文本
            '015': 'ZJTMPSAY',  // 临时消息
            '016': 'ZJFMSG',    // 浮动消息
            '018': 'ZJMSTR',    // 字符串消息
            '020': 'ZJPOPMENU', // 弹出菜单
            '021': 'ZJTTMENU',  // 标题菜单
            '022': 'ZJCHARHP',  // 角色HP
            '023': 'ZJLONGXX',  // 长消息XX
            '100': 'ZJCHANNEL', // 频道消息
            '999': 'SYSEXIT'    // 系统退出
        };

        // 提取协议代码
        const protocolMatch = message.match(/^\x1b(\d{3})(.*)/);
        if (!protocolMatch) return;

        const [, code, content] = protocolMatch;
        const protocolName = protocols[code] || 'UNKNOWN';

        // 处理特殊分隔符
        let processedContent = content
            .replace(/\$zj#/g, ' | ')   // ZJSEP
            .replace(/\$z2#/g, ' | ')   // ZJSP2
            .replace(/\$br#/g, '\n');   // ZJBR

        // 根据不同协议处理消息
        switch(code) {
            case '000': // SYSY - 系统消息
                // 检查是否包含 muy_updte: 
                if (processedContent.includes('muy_updte:')) {
                    const match = processedContent.match(/muy_updte:(.*)/);
                    if (match) {
                        const dependencyFile = match[1].trim();
                        this.log(`检测到依赖文件: ${dependencyFile}`, LogLevel.INFO);
                        // 自动更新依赖文件
                        this.sendUpdateCommand(dependencyFile);
                    }
                } else {
                    this.appendToGameLog(`系统消息: ${processedContent}`);
                }
                break;
                
            case '007': // ZJOBIN - 对象进入/登录成功
                this.setLoginState(true);
                break;

            case '015': // ZJTMPSAY - 临时消息
                this.appendToGameLog(processedContent);
                break;

            case '016': // ZJFMSG - 浮动消息
                vscode.window.showInformationMessage(processedContent);
                break;

            // 其他协议消息不输出到面板
        }
    }

    private cleanAnsiCodes(text: string): string {
        // 移除所有ANSI转义序列
        return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
    }

    private convertAnsiToVscode(text: string): string {
        // 移除所有 ESC 序列
        let result = text;
        
        // 替换颜色代码，使用转义的方括号
        const colorMap: { [key: string]: string } = {
            '\\[30m': '\x1b[30m',  // 黑色
            '\\[31m': '\x1b[31m',  // 红色
            '\\[32m': '\x1b[32m',  // 绿色
            '\\[33m': '\x1b[33m',  // 黄色
            '\\[34m': '\x1b[34m',  // 蓝色
            '\\[35m': '\x1b[35m',  // 洋红
            '\\[36m': '\x1b[36m',  // 青色
            '\\[37m': '\x1b[37m',  // 白色
            '\\[1;30m': '\x1b[1;30m',  // 亮黑
            '\\[1;31m': '\x1b[1;31m',  // 亮红
            '\\[1;32m': '\x1b[1;32m',  // 亮绿
            '\\[1;33m': '\x1b[1;33m',  // 亮黄
            '\\[1;34m': '\x1b[1;34m',  // 亮蓝
            '\\[1;35m': '\x1b[1;35m',  // 亮洋红
            '\\[1;36m': '\x1b[1;36m',  // 亮青
            '\\[1;37m': '\x1b[1;37m',  // 亮白
            '\\[2;37;0m': '\x1b[0m',   // 重置
        };

        // 替换颜色代码
        for (const [key, value] of Object.entries(colorMap)) {
            const pattern = this.ESC + key;
            result = result.replace(new RegExp(pattern, 'g'), value);
        }

        // 处理特殊分隔符
        result = result.replace(/\$zj#/g, ' | ');  // ZJSEP
        result = result.replace(/\$z2#/g, ' | ');  // ZJSP2
        result = result.replace(/\$br#/g, '\n');   // ZJBR

        return result;
    }

    private log(message: string, level: LogLevel = LogLevel.INFO, showNotification: boolean = false) {
        if (message.trim()) {
            // 修改时间戳格式
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const timestamp = `${hours}:${minutes}`;
            
            // 清理ANSI颜色代码
            const cleanMessage = this.cleanAnsiCodes(message);
            const logMessage = `[${timestamp}] ${cleanMessage}`;
            
            this.outputChannel.appendLine(logMessage);
            this.outputChannel.show(false);
            
            vscode.commands.executeCommand('game-server-compiler.appendLog', {
                message: logMessage,
                isError: level === LogLevel.ERROR
            });

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
        // 简化重连条件判断
        if (this.reconnectTimer || !this.lastHost || !this.lastPort) {
            return;
        }

        this._isReconnecting = true;
        this.log('开始重连流程', LogLevel.INFO);

        // 如果超过最大重试次数，停止重连
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log(`已达到最大重连次数(${this.maxReconnectAttempts})，停止重连`, LogLevel.ERROR);
            this.stopReconnect();
            return;
        }

        // 首次重连时显示状态
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
        try {
            this.lastHost = host;
            this.lastPort = port;
            this.log(`正在连接到 ${host}:${port}`, LogLevel.INFO);
            
            // 确保socket已初始化
            this.initSocket();

            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`连接超时: ${host}:${port}`));
                }, 5000);

                this.socket?.connect(port, host, () => {
                    clearTimeout(timeout);
                    this.setConnectionState(true);  // 移到这里设置连接状态
                    this.log(`成功连接到 ${host}:${port}`, LogLevel.INFO);
                    resolve();
                });

                this.socket?.once('error', (err) => {
                    clearTimeout(timeout);
                    this.handleConnectionError(err);
                    reject(err);
                });
            });
        } catch (error) {
            this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
            throw error;
        }
    }

    private async sendKey() {
        try {
            // 每次都优先从配置文件读取
            const configPath = path.join(vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '', '.vscode', 'muy-lpc-update.json');
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const fileConfig = JSON.parse(configData);
                if (fileConfig.serverKey) {
                    // 更新VS Code配置
                    const config = vscode.workspace.getConfiguration('gameServerCompiler');
                    await config.update('serverKey', fileConfig.serverKey, true);
                    this.log(`从配置文件读取到serverKey: ${fileConfig.serverKey}`, LogLevel.INFO);
                    const key = `${this.sha1(fileConfig.serverKey)}\n`;
                    this.socket?.write(key);
                    this.log('发送版本验证密钥', LogLevel.INFO);
                    return;
                }
            }
            
            // 如果配置文件读取失败，尝试从VS Code配置读取
            const config = vscode.workspace.getConfiguration('gameServerCompiler');
            const serverKey = config.get<string>('serverKey');
            if (serverKey) {
                this.log(`从VS Code配置读取到serverKey: ${serverKey}`, LogLevel.INFO);
                const key = `${this.sha1(serverKey)}\n`;
                this.socket?.write(key);
                this.log('发送版本验证密钥', LogLevel.INFO);
                return;
            }

            const errorMsg = '服务器密钥未配置，请在设置中配置serverKey';
            this.log(errorMsg, LogLevel.ERROR, true);
            this.disconnect();
        } catch (error) {
            this.log(`读取或发送密钥失败: ${error}`, LogLevel.ERROR);
            this.disconnect();
        }
    }

    private async login() {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        let username = config.get<string>('username', '');
        let password = config.get<string>('password', '');

        if (!username || !password) {
            const inputUsername = await vscode.window.showInputBox({
                prompt: '请输入巫师账号',
                placeHolder: 'username'
            });
            if (!inputUsername) {
                this.disconnect();
                return;
            }
            username = inputUsername;

            const inputPassword = await vscode.window.showInputBox({
                prompt: '请输入密码',
                placeHolder: 'password'
            });
            if (!inputPassword) {
                this.disconnect();
                return;
            }
            password = inputPassword;

            // 保存配置
            await config.update('username', username, true);
            await config.update('password', password, true);
            this.log('用户配置已保存', LogLevel.INFO);
        }

        this.log('开始登录...', LogLevel.INFO);
        this.log(`当前状态: connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.INFO);
        
        const loginString = `${username}║${password}║zzzz\n`;
        this.log(`发送登录信息: ${username}║${password}║zzzz`, LogLevel.INFO);
        this.socket?.write(loginString, () => {
            this.log('登录信息发送完成', LogLevel.DEBUG);
        });
    }

    private sendCommand(command: string, commandName: string = '命令') {
        // 添加详细的状态检查日志
        this.log(`发送命令前状态检查:`, LogLevel.DEBUG);
        this.log(`- 连接状态: ${this.connected}`, LogLevel.DEBUG);
        this.log(`- 登录状态: ${this.loggedIn}`, LogLevel.DEBUG);

        if (!this.connected || !this.socket) {
            this.log('错误: 未连接到服务器', LogLevel.ERROR);
            return false;
        }

        if (!this.loggedIn) {
            this.log('错误: 未登录', LogLevel.ERROR);
            this.log(`当前状态: connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.ERROR);
            return false;
        }

        this.log(`发送命令: ${command}`, LogLevel.INFO);
        this.socket.write(`${command}\n`);
        return true;
    }

    sendCustomCommand(command: string) {
        this.sendCommand(command, '自定义命令');
    }

    sendRestartCommand() {
        this.sendCommand('shutdown', '重启命令');
    }

    sendUpdateCommand(filePath: string) {
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
            // 移除文件扩展名
            const filePathWithoutExt = filePath.replace(/\.[^/.]+$/, "");
            const command = `update ${filePathWithoutExt}`;
            
            this.log(`发送更新命令: ${command}`, LogLevel.INFO);
            this.socket.write(`${command}\n`, () => {
                this.log('更新命令发送完成', LogLevel.DEBUG);
            });
            
            return true;
        } catch (error) {
            const errorMessage = `发送更新命令失败: ${error}`;
            this.log(errorMessage, LogLevel.ERROR);
            vscode.window.showErrorMessage(errorMessage);
            return false;
        }
    }

    sendCompileCommand() {
        this.sendCommand('COMPILE', '编译命令');
    }

    disconnect() {
        this.stopReconnect(); // 停止重连
        if (this.socket) {
            this.log('断开连接', LogLevel.INFO);
            this.socket.destroy();
            this.socket = null;
        }
        this.lastHost = '';
        this.lastPort = 0;
        this.reconnectAttempts = 0;
        this.versionVerified = false;  // 重置版本验证标志
        this.connected = false;  // 确保连接状态被重置
        this.loggedIn = false;   // 确保登录状态被重置
        
        // 更新按钮状态
        this.buttonProvider?.updateConnectionState(false);
        
        // 更新配置和状态
        this.setConnectionState(false);
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
            // 确保更新按钮状态
            this.buttonProvider?.updateConnectionState(true);
        } 
        else if (status === 'disconnected') {
            this.connected = false;
            this.loggedIn = false;
            showNotification = true;
            this.isFirstConnect = true;
            this.isFirstLogin = true;
            // 确保更新按钮状态
            this.buttonProvider?.updateConnectionState(false);
            // 确保连接状态更新
            this.setConnectionState(false);
        }
        else if (status === 'loggedIn' && this.isFirstLogin) {
            showNotification = true;
            this.isFirstLogin = false;
            // 确保更新按钮状态
            this.buttonProvider?.updateConnectionState(true);
        }
        
        this.log(message, LogLevel.INFO, showNotification);
    }

    // 简化消息输出方法
    private appendToGameLog(message: string) {
        if (message.trim()) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            const timestamp = `${hours}:${minutes}`;
            
            // 清理ANSI颜色代码
            const cleanMessage = this.cleanAnsiCodes(message);
            const logMessage = `[${timestamp}] ${cleanMessage}`;
            this.outputChannel.appendLine(logMessage);
            this.outputChannel.show(false);
        }
    }

    // 修改错误处理，确保错误消息显示在所有地方
    private handleConnectionError(error: Error) {
        const errorMessage = `连接失败: ${error.message}`;
        this.log(errorMessage, LogLevel.ERROR, true);
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
        this.setConnectionState(false);
        this.log('与服务器断开连接', LogLevel.INFO);
        
        // 重置重连状态
        this._isReconnecting = false;
        this.reconnectAttempts = 0;
        
        if (wasConnected) {
            // 确保开始重连
            this.startReconnect();
        }
    }

    // 新增方法：统一设置登录状态
    private setLoginState(isLoggedIn: boolean) {
        const prevState = this.loggedIn;
        this.loggedIn = isLoggedIn;
        
        if (isLoggedIn && !prevState) {  // 只在状态从未登录变为登录时触发
            this.log(`登录状态更新: loggedIn=${this.loggedIn}`, LogLevel.INFO);
            // 立即检查状态
            this.log(`状态检查 - 登录成功后:`, LogLevel.DEBUG);
            this.log(`- 连接状态: ${this.connected}`, LogLevel.DEBUG);
            this.log(`- 登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
            
            // 显示登录成功通知
            vscode.window.showInformationMessage('游戏服务器登录成功！');
            
            // 确保更新连接状态
            this.setConnectionState(true);
        }
    }
} 
