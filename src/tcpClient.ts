import * as net from 'net';
import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { LogManager, LogLevel } from './log/LogManager';
import { ButtonProvider } from './buttonProvider';
import * as iconv from 'iconv-lite';
import { MessageParser } from './utils/messageParser';
import { IDisposable } from './interfaces/IDisposable';
import { ConfigManager } from './config/ConfigManager';
import { MessageDeduplicator } from './utils/MessageDeduplicator';
import { PerformanceMonitor } from './utils/PerformanceMonitor';
import { PathConverter } from './utils/PathConverter';
import {
    beginCompilerMessageFilterState,
    consumeCompilerNoiseLine,
    formatCompilerDiagnosticSummary,
    parseCompilerDiagnosticHeader,
    type CompilerMessageFilterState
} from './utils/compilerDiagnostics';
import { shouldRevealProblemsPanel, type ProblemsAutoRevealMode } from './utils/diagnosticUi';
import {
    consumeMudlibCompileFallbackLine,
    createMudlibCompileFallbackState,
    type MudlibCompileFallbackState
} from './utils/mudlibCompileFallback';
import { isRemoteCompileSuccessMessage } from './utils/remoteCompileStatus';
import {
    createFileLineTextResolver,
    resolveDiagnosticRange
} from './utils/diagnosticRange';
import {
    formatCompilerDiagnosticMessage,
    normalizeCompilerDiagnosticMessageLanguage
} from './utils/compilerDiagnosticLocalization';
import {
    buildCompileOutputFinishLines,
    buildCompileOutputProgressDiagnosticLine,
    buildCompileOutputStartLines
} from './utils/compileOutput';

export class TcpClient implements IDisposable {
    private socket: net.Socket | null = null;
    private connected: boolean = false;
    private loggedIn: boolean = false;
    private outputChannel: vscode.OutputChannel;
    private compileOutputChannel: vscode.OutputChannel;
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
    private retryTimer: NodeJS.Timeout | null = null;
    private config: vscode.WorkspaceConfiguration;
    private muyBuffer: string = '';
    private isCollectingMuy: boolean = false;
    private encoding: string = 'UTF8';
    private messageDeduplicator: MessageDeduplicator;
    private performanceMonitor: PerformanceMonitor;
    private diagnosticCollection: vscode.DiagnosticCollection | null = null;
    private configManager: ConfigManager;
    private configDisposables: vscode.Disposable[] = [];
    private connectPromise: Promise<void> | null = null;
    private readonly resolveDiagnosticLineText = createFileLineTextResolver();
    private firstErrorFile: string = '';
    private errorLine: number = 0;
    private errorMessage: string = '';
    private currentCompileMudPath: string | null = null;
    private currentCompileRootPath: string | null = null;
    private compilerMessageFilterState: CompilerMessageFilterState = {
        awaitingSourceLine: false,
        awaitingCaretLine: false
    };
    private mudlibCompileFallbackState: MudlibCompileFallbackState =
        createMudlibCompileFallbackState();
    private suppressCompilerContinuation: boolean = false;
    private commandTimeout: number = 30000; // 30秒超时
    private pendingCommand: boolean = false;

    // 🚀 性能优化：预编译的正则表达式（静态常量）
    private static readonly ANSI_COLOR_CODES = /\x1b\[f#[0-9a-fA-F]{6}m/g;
    private static readonly ANSI_COLORS = /\x1b\[3[0-7]m/g;
    private static readonly ANSI_BOLD_COLORS = /\x1b\[1;3[0-7]m/g;
    private static readonly ANSI_UNDERLINE = /\x1b\[4[0-7]m/g;
    private static readonly ANSI_UNDERLINE_BOLD = /\x1b\[4[0-7];1m/g;
    private static readonly ANSI_ALL = /\x1b\[[0-9;]*[mK]/g;
    private static readonly CONTROL_CODES = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;

    constructor(
        outputChannel: vscode.OutputChannel,
        compileOutputChannel: vscode.OutputChannel,
        buttonProvider: ButtonProvider,
        messageProvider: any
    ) {
        this.outputChannel = outputChannel;
        this.compileOutputChannel = compileOutputChannel;
        this.buttonProvider = buttonProvider;
        this.messageProvider = messageProvider;
        this.configManager = ConfigManager.getInstance();
        this.config = vscode.workspace.getConfiguration('gameServerCompiler');

        // 🚀 监听配置切换事件
        this.configDisposables.push(this.configManager.onProfileChanged((event) => {
            this.log(`配置已切换: ${event.oldProfile} -> ${event.newProfile}`, LogLevel.INFO);
            this.updateEncoding();
            if (this.isConnected()) {
                this.log('配置已切换，断开连接', LogLevel.INFO);
                this.disconnect();
            }
        }));
        this.configDisposables.push(this.configManager.onConfigChanged(() => {
            this.updateEncoding();
        }));

        this.configDisposables.push(vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('gameServerCompiler.connection')) {
                this.config = vscode.workspace.getConfiguration('gameServerCompiler');
            }
        }));

        const maxMessages = this.config.get<number>('messages.maxCount', 1000);
        const dedupeWindow = this.config.get<number>('messages.dedupeWindow', 1000);
        this.messageDeduplicator = new MessageDeduplicator({
            timeWindow: dedupeWindow,
            maxCacheSize: maxMessages
        });

        this.performanceMonitor = PerformanceMonitor.getInstance();

        this.initSocket();

        // 创建诊断集合
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lpc');

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
                            const rawMode = this.messageProvider?.shouldShowRawServerData?.() === true;
                            if (rawMode) {
                                this.outputChannel.appendLine(`[RAW] ${message}`);
                            }
                            this.messageProvider?.addRawServerMessage?.(message);
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

    /**
     * 🚀 优化：使用预编译正则表达式的颜色代码清理
     * 性能提升：~50%
     */
    private cleanColorCodes(text: string): string {
        if (!text) {return text;}

        // 🚀 性能监控：开始计时
        const endTimer = this.performanceMonitor.start('cleanColorCodes');

        // 使用预编译的正则表达式，避免每次创建新的正则对象
        let result = text;

        // 🚀 先使用通用正则表达式移除所有ANSI转义序列（这能处理大部分情况）
        result = result.replace(TcpClient.ANSI_ALL, '');

        // 然后移除特定格式的ANSI代码（以防万一）
        result = result.replace(TcpClient.ANSI_COLOR_CODES, '');
        result = result.replace(TcpClient.ANSI_COLORS, '');
        result = result.replace(TcpClient.ANSI_BOLD_COLORS, '');
        result = result.replace(TcpClient.ANSI_UNDERLINE, '');
        result = result.replace(TcpClient.ANSI_UNDERLINE_BOLD, '');

        // 🚀 移除孤立的[数字m格式的ANSI代码残留（ESC已被移除）
        result = result.replace(/\[[0-9;]*[mK]/g, '');

        // 移除剩余的控制字符
        result = result.replace(TcpClient.CONTROL_CODES, '');

        // 移除孤立的ESC字符
        result = result.replace(/\x1b/g, '');

        // 🚀 性能监控：结束计时
        endTimer();

        return result;
    }

    /**
     * 🚀 优化：添加消息去重逻辑
     */
    private processMessage(message: string): void {
        // 🚀 性能监控：开始计时
        const endTimer = this.performanceMonitor.start('processMessage');

        try {
            if (message.startsWith('\x1b012')) {
                return;
            }

            // 过滤单个 ^ 符号的消息
            if (message.trim() === '^') {
                return;  // 完全跳过，不记录日志
            }

            // 🚀 性能优化：检查是否为重复消息
            if (this.messageDeduplicator.isDuplicate(message)) {
                this.log(`过滤重复消息: ${message.substring(0, 50)}...`, LogLevel.DEBUG);
                return; // 跳过重复消息
            }

            const cleanedMessage = this.cleanColorCodes(message).trimEnd();

            const noiseResult = consumeCompilerNoiseLine(
                cleanedMessage,
                this.compilerMessageFilterState
            );
            this.compilerMessageFilterState = noiseResult.nextState;
            if (noiseResult.consumed) {
                this.log(cleanedMessage, LogLevel.DEBUG);
                return;
            }

            const mudlibFallbackResult = consumeMudlibCompileFallbackLine(
                cleanedMessage,
                this.mudlibCompileFallbackState
            );
            this.mudlibCompileFallbackState = mudlibFallbackResult.nextState;
            if (mudlibFallbackResult.emittedDiagnostic) {
                const diagnostic = mudlibFallbackResult.emittedDiagnostic;
                const languageMode = this.getCompilerDiagnosticLanguageMode();
                const summary = formatCompilerDiagnosticSummary(diagnostic, { languageMode });
                const displayMessage = formatCompilerDiagnosticMessage(
                    diagnostic.message,
                    diagnostic.severity,
                    languageMode
                );
                const isFirstError = !this.firstErrorFile;
                if (isFirstError) {
                    this.firstErrorFile = diagnostic.file;
                    this.errorLine = diagnostic.line;
                    this.errorMessage = diagnostic.message;
                }

                const localPath = this.resolveDiagnosticLocalPath(diagnostic.file);
                if (localPath) {
                    this.messageProvider?.addCompilerDiagnostic?.({
                        displayPath: diagnostic.file,
                        localPath,
                        line: diagnostic.line,
                        column: diagnostic.column,
                        message: diagnostic.message,
                        rawMessage: diagnostic.message,
                        severity: diagnostic.severity
                    });
                } else {
                    this.messageProvider?.addMessage(summary);
                }
                this.ensureRemoteCompileOutputStarted(diagnostic.file);
                this.appendRemoteCompileDiagnosticOutput(summary, diagnostic.severity);
                this.showCompileError(
                    diagnostic.file,
                    diagnostic.line,
                    displayMessage,
                    localPath,
                    diagnostic.column,
                    vscode.DiagnosticSeverity.Error,
                    isFirstError,
                    diagnostic.message
                );
                this.maybeRevealProblemsPanel('error');
                return;
            }
            if (mudlibFallbackResult.consumed) {
                this.log(cleanedMessage, LogLevel.DEBUG);
                return;
            }

            const compilerDiagnostic = parseCompilerDiagnosticHeader(cleanedMessage);
            if (compilerDiagnostic) {
                const languageMode = this.getCompilerDiagnosticLanguageMode();
                const summary = formatCompilerDiagnosticSummary(compilerDiagnostic, { languageMode });
                const displayMessage = formatCompilerDiagnosticMessage(
                    compilerDiagnostic.message,
                    compilerDiagnostic.severity,
                    languageMode
                );
                this.suppressCompilerContinuation = true;
                this.compilerMessageFilterState = beginCompilerMessageFilterState();

                // 处理 debug_eval_file.c 的错误显示
                if (compilerDiagnostic.file === '/debug_eval_file.c') {
                    const evalErrorMsg = `❌ Eval指令执行错误: ${displayMessage}`;
                    this.messageProvider?.addMessage(evalErrorMsg);
                    this.log(evalErrorMsg, LogLevel.ERROR, false);
                    return;
                }

                const isFirstError =
                    compilerDiagnostic.severity === 'error' && !this.firstErrorFile;

                if (isFirstError) {
                    this.firstErrorFile = compilerDiagnostic.file;
                    this.errorLine = compilerDiagnostic.line;
                    this.errorMessage = compilerDiagnostic.message;
                }

                const location = compilerDiagnostic.column
                    ? `${compilerDiagnostic.file}:${compilerDiagnostic.line}:${compilerDiagnostic.column}`
                    : `${compilerDiagnostic.file}:${compilerDiagnostic.line}`;
                const localPath = this.resolveDiagnosticLocalPath(compilerDiagnostic.file);
                if (localPath) {
                    this.messageProvider?.addCompilerDiagnostic?.({
                        displayPath: compilerDiagnostic.file,
                        localPath,
                        line: compilerDiagnostic.line,
                        column: compilerDiagnostic.column,
                        message: compilerDiagnostic.message,
                        rawMessage: compilerDiagnostic.message,
                        severity: compilerDiagnostic.severity
                    });
                } else {
                    this.messageProvider?.addMessage(summary);
                }
                this.ensureRemoteCompileOutputStarted(compilerDiagnostic.file);
                this.appendRemoteCompileDiagnosticOutput(summary, compilerDiagnostic.severity);

                this.showCompileError(
                    compilerDiagnostic.file,
                    compilerDiagnostic.line,
                    displayMessage,
                    localPath,
                    compilerDiagnostic.column,
                    compilerDiagnostic.severity === 'warning'
                        ? vscode.DiagnosticSeverity.Warning
                        : vscode.DiagnosticSeverity.Error,
                    isFirstError,
                    compilerDiagnostic.message
                );
                this.maybeRevealProblemsPanel(compilerDiagnostic.severity);
                return;
            }

            // 检查编译成功消息
            if (isRemoteCompileSuccessMessage(cleanedMessage)) {
                this.finishRemoteCompileOutput('成功', '编译成功');
                this.clearDiagnostics();
                
                // 显示成功消息
                this.messageProvider?.addMessage('✅ 编译成功');
                this.log('编译成功', LogLevel.INFO);
                return;
            }

            if (this.suppressCompilerContinuation) {
                this.log(cleanedMessage, LogLevel.DEBUG);
                return;
            }

            // 处理 eval 命令结果
            if (message.startsWith('mixed eval(object me) { return ')) {
                const evalResult = message.replace('mixed eval(object me) { return ', '');
                const evalMsg = `❗ EVAL指令: ${evalResult}`;
                this.messageProvider?.addMessage(evalMsg);
                this.log(evalMsg, LogLevel.INFO);
                return;
            }

            // 过滤不需要在边栏显示的错误堆栈信息
            if (message.startsWith('程式：') || 
                message.startsWith('物件：') || 
                message.startsWith('呼叫来自：') ||
                message.startsWith('错误讯息被拦截：') ||
                message.startsWith('执行时段错误：') ||
                message.startsWith('*Error in loading')) {
                // 只在输出面板显示
                this.log(message, LogLevel.DEBUG);
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
                          this.log(`🔍 Eval结果:\n${formattedJson}`, LogLevel.DEBUG);
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
        } finally {
            // 🚀 性能监控：结束计时
            endTimer();
        }
    }

    private processNormalMessage(message: string) {
        try {
            const cleanedMessage = this.cleanColorCodes(message);
            
            this.log(`处理普通消息: ${cleanedMessage}`, LogLevel.DEBUG);

            if (cleanedMessage.includes('你的账号在别处登录') || cleanedMessage.includes('你被迫下线了')) {
                this.handleAccountLoggedInElsewhere();
                return;
            }

            if (cleanedMessage === '版本验证成功') {
                this.log('版本验证成功，开始登录', LogLevel.INFO);
                this.login();
            } else if (cleanedMessage.includes('muy_update:')) {
                const match = cleanedMessage.match(/muy_update:(.*)/);
                if (match) {
                    const dependencyFile = match[1].trim();
                    this.log(`检测到依赖文件更新: ${dependencyFile}`, LogLevel.INFO);
                    void this.sendUpdateCommand(dependencyFile).catch(error => {
                        this.log(`处理依赖文件编译失败: ${error}`, LogLevel.ERROR);
                    });
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

                const rawMode = this.messageProvider?.shouldShowRawServerData?.() === true;
                if (this.messageProvider && !rawMode) {
                    this.messageProvider.addMessage(cleanedMessage, true);
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
                void this.sendCommand(cleanedContent).catch(error => {
                    this.log(`执行014协议命令失败: ${error}`, LogLevel.ERROR);
                });
                break;
            case '015':
                if (isRemoteCompileSuccessMessage(cleanedContent)) {
                    this.finishRemoteCompileOutput('成功', '编译成功');
                    this.clearDiagnostics();
                    this.messageProvider?.addMessage('✅ 编译成功');
                    this.log('编译成功', LogLevel.INFO);
                    return;
                }
                if (cleanedContent.includes('你的账号在别处登录') || cleanedContent.includes('你被迫下线了')) {
                    this.handleAccountLoggedInElsewhere();
                    return;
                }
                if (cleanedContent.includes('密码错误') || cleanedContent.includes('账号不存在')) {
                    this.log(cleanedContent, LogLevel.ERROR, false);
                    this.disconnect();
                } else if (cleanedContent.includes('更新中') || cleanedContent.includes('维护中')) {
                    this.log(cleanedContent, LogLevel.INFO, false);
                    this.disconnect();
                } else {
                    this.log(cleanedContent, LogLevel.INFO);
                }
                break;
        }
    }

    private cleanAnsiCodes(text: string): string {
        return text.replace(/\x1B\[[0-9;]*[JKmsu]/g, '');
    }

    private log(message: string, level: LogLevel = LogLevel.INFO, showNotification: boolean = false) {
        if (message.trim()) {
            const cleanMessage = this.cleanAnsiCodes(message);
            if (level !== LogLevel.DEBUG) {
                const importantInfo =
                    cleanMessage.includes('连接') ||
                    cleanMessage.includes('登录') ||
                    cleanMessage.includes('验证') ||
                    cleanMessage.includes('断开') ||
                    cleanMessage.includes('重连') ||
                    cleanMessage.includes('失败') ||
                    cleanMessage.includes('错误') ||
                    cleanMessage.includes('超时');

                if (level === LogLevel.ERROR || importantInfo) {
                    const prefix = level === LogLevel.ERROR ? '[错误]' : '[信息]';
                    this.outputChannel.appendLine(`${prefix} ${cleanMessage}`);
                }
            }

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
                if (this.messageProvider) {
                    // 插件生成的提示消息应该标记为非服务器消息(isServerMessage=false)
                    this.messageProvider.addMessage(`${icon}${content}`, false);
                }
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
            if (this.connected || this.connectPromise) {
                if (this.connected) {
                    this.stopReconnect();
                }
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

        if (this.connectPromise) {
            return this.connectPromise;
        }

        // 🚀 性能监控：开始计时
        const endTimer = this.performanceMonitor.start('connect');

        const connectTask = (async () => {
            let timeoutId: NodeJS.Timeout | null = null;
            try {
                this.lastHost = host;
                this.lastPort = port;
                this.log(`正在连接到 ${host}:${port}`, LogLevel.INFO);

                this.initSocket();

                const timeout = this.config.get<number>('connection.timeout', 10000);
                const timeoutPromise = new Promise<void>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('连接超时')), timeout);
                });

                const socketConnectPromise = new Promise<void>((resolve, reject) => {
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

                await Promise.race([socketConnectPromise, timeoutPromise]);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                this.log('连接成功，等待服务器响应', LogLevel.INFO);
            } catch (error) {
                this.handleConnectionError(error instanceof Error ? error : new Error(String(error)));
                throw error;
            } finally {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                endTimer();
                this.connectPromise = null;
            }
        })();

        this.connectPromise = connectTask;
        return connectTask;
    }

    private async sendKey() {
        try {
            // 🚀 使用ConfigManager获取当前激活的配置
            const config = this.configManager.getConfig();

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
            // 🚀 使用ConfigManager获取当前激活的配置
            const config = this.configManager.getConfig();

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

    private async executeCommand(command: string, commandName: string = '命令'): Promise<void> {
        if (this.pendingCommand) {
            this.log('有命令正在执行中，请稍后再试', LogLevel.INFO);
            throw new Error('命令执行中');
        }

        try {
            this.pendingCommand = true;
            this.log(`发送${commandName}: ${command}`, LogLevel.DEBUG);

            await new Promise<void>((resolve, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error('命令执行超时'));
                }, this.commandTimeout);

                try {
                    this.socket?.write(command + '\n', () => {
                        clearTimeout(timeoutId);
                        resolve();
                    });
                } catch (error) {
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });

            this.log(`${commandName}发送完成`, LogLevel.DEBUG);
        } finally {
            this.pendingCommand = false;
        }
    }

    private async sendCommand(command: string, commandName: string = '命令'): Promise<void> {
        if (!this.checkState()) {
            return;
        }

        this.suppressCompilerContinuation = false;
        this.mudlibCompileFallbackState = createMudlibCompileFallbackState();
        
        try {
            await this.executeCommand(command, commandName);
        } catch (error: any) { // 显式指定 error 类型
            if (error instanceof Error) {
                if (error.message === '命令执行中') {
                    this.messageProvider?.addMessage('⚠️ 请等待当前命令执行完成');
                } else if (error.message === '命令执行超时') {
                    this.log('命令执行超时，正在重置状态', LogLevel.ERROR);
                    this.messageProvider?.addMessage('❌ 命令执行超时，请重试');
                    // 重置状态
                    this.pendingCommand = false;
                } else {
                    const errorMessage = `发送${commandName}失败: ${error.message}`;
                    this.log(errorMessage, LogLevel.ERROR);
                    this.messageProvider?.addMessage(`❌ ${errorMessage}`);
                }
            } else {
                const errorMessage = `发送${commandName}失败: 未知错误`;
                this.log(errorMessage, LogLevel.ERROR);
                this.messageProvider?.addMessage(`❌ ${errorMessage}`);
            }
            throw error;
        }
    }

    async sendUpdateCommand(filePath: string, compileRootPath?: string) {
        if (!this.checkState()) {
            return;
        }

        // 🚀 性能监控：开始计时
        const endTimer = this.performanceMonitor.start('sendUpdateCommand');

        this.log(`🔄 准备编译文件: ${filePath}`, LogLevel.INFO);
        const nextCompileRootPath = compileRootPath ?? this.currentCompileRootPath;
        this.clearDiagnostics();
        this.currentCompileMudPath = filePath;
        this.currentCompileRootPath = nextCompileRootPath;
        this.appendCompileOutputLines(buildCompileOutputStartLines('远程编译', filePath));

        try {
            await this.sendCommand(`update ${filePath}`, '编译命令');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.finishRemoteCompileOutput('失败', `发送编译命令失败: ${errorMessage}`);
            this.clearDiagnostics();
            throw error;
        } finally {
            endTimer(); // 🚀 性能监控：结束计时
        }
    }

    async sendCompileCommand(command: string, showDetails: boolean = true) {
        const config = vscode.workspace.getConfiguration('gameServerCompiler');
        const timeout = config.get<number>('compile.timeout', 30000);

        try {
            if (showDetails) {
                this.log(`发送编译命令: ${command}`, LogLevel.INFO);
            }

            this.clearDiagnostics();

            const timeoutPromise = new Promise<void>((_, reject) => {
                setTimeout(() => reject(new Error('编译超时')), timeout);
            });

            await Promise.race([this.sendCommand(command, '编译命令'), timeoutPromise]);
            
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
        try {
            // 重置所有状态
            this.connected = false;
            this.loggedIn = false;
            this.pendingCommand = false;
            
            // 重置编译错误相关状态
            this.firstErrorFile = '';
            this.errorLine = 0;
            this.errorMessage = '';
            
            // 清理诊断信息
            this.clearDiagnostics();
            
            // 关闭socket
            if (this.socket) {
                this.socket.destroy();
                this.socket = null;
            }
            
            // 更新按钮状态
            this.buttonProvider.updateConnectionState(false);
            
            this.log('已断开服务器连接', LogLevel.INFO);
        } catch (error) {
            this.log(`断开连接失败: ${error}`, LogLevel.ERROR);
        }
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
        this.log(`命令状态: ${commandName} (${command}), connected=${this.connected}, loggedIn=${this.loggedIn}`, LogLevel.DEBUG);
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
            // 保留入口用于后续诊断扩展；默认不写入Output，避免噪声
            this.ensureUTF8(message);
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
        this.log(`错误信息: ${error.message}`, LogLevel.ERROR);
        
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
            const config = this.configManager.getConfig();
            const normalizedEncoding = (config.encoding || 'UTF8').toUpperCase();
            const nextEncoding = normalizedEncoding === 'GBK' ? 'GBK' : 'UTF8';
            if (this.encoding !== nextEncoding) {
                this.encoding = nextEncoding;
                this.log(`编码设置已更新: ${this.encoding}`, LogLevel.INFO);
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

    private encodeMessage(message: string): Buffer {
        try {
            this.outputChannel.appendLine('==== 编码消息 ====');
            this.outputChannel.appendLine(`原始消息: ${message}`);
            this.outputChannel.appendLine(`使用编码: ${this.encoding}`);
            
            const encodedMessage = iconv.encode(message + '\n', this.encoding);
            this.outputChannel.appendLine(`编码结果长度: ${encodedMessage.length}`);
            this.outputChannel.appendLine(`编码结果: ${encodedMessage.toString('hex')}`);
            
            this.log(`消息编码(${this.encoding}): ${message}`, LogLevel.DEBUG);
            return encodedMessage;
        } catch (error) {
            this.outputChannel.appendLine(`消息编码失败: ${error}`);
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
            this.outputChannel.appendLine('==== 发送自定义命令 ====');
            this.outputChannel.appendLine(`原始命令: ${command}`);
            
            const buffer = this.encodeMessage(command);
            this.outputChannel.appendLine(`编码后长度: ${buffer.length}`);
            this.outputChannel.appendLine(`编码后内容: ${buffer.toString('hex')}`);

            await new Promise<void>((resolve, reject) => {
                if (!this.socket) {
                    reject(new Error('未建立TCP连接'));
                    return;
                }

                try {
                    this.socket.write(buffer, () => resolve());
                } catch (error) {
                    reject(error);
                }
            });
            this.log(`发送自定义命令: ${command}`, LogLevel.INFO);
        } catch (error) {
            this.outputChannel.appendLine(`发送自定义命令失败: ${error}`);
            this.log(`发送自定义命令失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    public async sendEvalCommand(code: string): Promise<void> {
        this.outputChannel.appendLine('==== 发送Eval命令 ====');
        this.outputChannel.appendLine(`原始代码: ${code}`);
        const fullCommand = `eval return ${code}`;
        this.outputChannel.appendLine(`完整命令: ${fullCommand}`);
        await this.sendCustomCommand(fullCommand);
    }

    public async sendRestartCommand(): Promise<void> {
        if (!this.checkState()) {
            return;
        }
        this.log('🔄 发送重启命令', LogLevel.INFO);
        await this.sendCommand('shutdown', '重启命令');
    }

    /**
     * 🚀 优化：完整的资源清理
     * 确保没有内存泄漏
     */
    dispose() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        // 清理socket
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }

        // 清理诊断集合
        if (this.diagnosticCollection) {
            this.diagnosticCollection.dispose();
            this.diagnosticCollection = null;
        }

        // 清理消息去重器
        if (this.messageDeduplicator) {
            this.messageDeduplicator.clear();
        }

        this.configDisposables.forEach(d => d.dispose());
        this.configDisposables = [];
    }

    private showCompileError(
        mudPath: string,
        line: number,
        message: string,
        localPath: string | null,
        column?: number,
        severity: vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error,
        revealToEditor: boolean = true,
        rawMessage: string = message
    ) {
        try {
            if (!localPath) {
                this.log(`无法解析诊断文件路径: ${mudPath}`, LogLevel.ERROR);
                return;
            }

            const fileUri = vscode.Uri.file(localPath);

            const lineNumber = line - 1;
            const lineText = this.resolveDiagnosticLineText(localPath, line);
            const { startColumn, endColumn } = resolveDiagnosticRange({
                lineText,
                column,
                message: rawMessage
            });

            const range = new vscode.Range(
                new vscode.Position(lineNumber, startColumn),
                new vscode.Position(lineNumber, endColumn)
            );

            const diagnostic = new vscode.Diagnostic(
                range,
                message,
                severity
            );
            diagnostic.source = 'FluffOS Compiler';

            if (!this.diagnosticCollection) {
                this.diagnosticCollection = vscode.languages.createDiagnosticCollection('lpc');
            }

            const existingDiagnostics = this.diagnosticCollection.get(fileUri) ?? [];
            this.diagnosticCollection.set(fileUri, [...existingDiagnostics, diagnostic]);

            if (revealToEditor) {
                vscode.workspace.openTextDocument(fileUri).then(doc => {
                    vscode.window.showTextDocument(doc).then(editor => {
                        editor.selection = new vscode.Selection(range.start, range.start);
                        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
                    });
                });
            }
        } catch (error) {
            this.log(`显示编译错误失败: ${error}`, LogLevel.ERROR);
        }
    }

    private getCompilerDiagnosticLanguageMode() {
        return normalizeCompilerDiagnosticMessageLanguage(
            vscode.workspace
                .getConfiguration('gameServerCompiler')
                .get<string>('diagnostics.messageLanguage', 'dual')
        );
    }

    private resolveDiagnosticLocalPath(mudPath: string): string | null {
        const config = this.configManager.getConfig();
        const preferredRootPath = this.currentCompileRootPath || config.rootPath;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

        try {
            return PathConverter.resolveLocalPathWithRoot(
                mudPath,
                preferredRootPath,
                workspaceRoot
            ).localPath;
        } catch (error) {
            this.log(`转换诊断文件路径失败: ${error}`, LogLevel.ERROR);
            return null;
        }
    }

    private maybeRevealProblemsPanel(severity: 'error' | 'warning') {
        const mode = this.config.get<ProblemsAutoRevealMode>(
            'ui.autoRevealProblems',
            'error'
        );

        if (!shouldRevealProblemsPanel(mode, severity)) {
            return;
        }

        void vscode.commands.executeCommand('workbench.actions.view.problems');
    }

    private appendCompileOutputLines(lines: readonly string[]) {
        for (const line of lines) {
            this.compileOutputChannel.appendLine(line);
        }
    }

    private ensureRemoteCompileOutputStarted(target: string) {
        if (this.currentCompileMudPath) {
            return;
        }
        this.currentCompileMudPath = target;
        this.appendCompileOutputLines(buildCompileOutputStartLines('远程编译', target));
    }

    private appendRemoteCompileDiagnosticOutput(summary: string, severity: 'error' | 'warning') {
        this.appendCompileOutputLines([
            buildCompileOutputProgressDiagnosticLine(severity, summary)
        ]);
    }

    private finishRemoteCompileOutput(resultLabel: string, summary: string) {
        if (!this.currentCompileMudPath) {
            return;
        }
        this.appendCompileOutputLines(buildCompileOutputFinishLines(resultLabel, summary));
    }

    /**
     * 保留原有方法用于全局清理
     */
    private clearDiagnostics() {
        if (this.diagnosticCollection) {
            this.diagnosticCollection.clear();
        }
        this.firstErrorFile = '';
        this.errorLine = 0;
        this.errorMessage = '';
        this.currentCompileMudPath = null;
        this.currentCompileRootPath = null;
        this.suppressCompilerContinuation = false;
        this.mudlibCompileFallbackState = createMudlibCompileFallbackState();
        this.compilerMessageFilterState = {
            awaitingSourceLine: false,
            awaitingCaretLine: false
        };
    }

    // 添加命令发送前的状态检查
    private checkState(): boolean {
        this.log(`🔍 检查状态:`, LogLevel.DEBUG);
        this.log(`- 🔌 连接状态: ${this.connected}`, LogLevel.DEBUG);
        this.log(`- 👤 登录状态: ${this.loggedIn}`, LogLevel.DEBUG);
        
        if (!this.isConnected()) {
            this.log('❌ 服务器未连接，无法发送命令', LogLevel.ERROR);
            vscode.window.showErrorMessage('⚠️ 请先连接到服务器');
            return false;
        }
        if (!this.isLoggedIn()) {
            this.log('❌ 角色未登录，无法发送命令', LogLevel.ERROR);
            vscode.window.showErrorMessage('⚠️ 请先登录');
            return false;
        }
        return true;
    }

    private handleAccountLoggedInElsewhere() {
        this.disconnect();
        vscode.window.showErrorMessage('⚠️ 您的账号在别处登录，所有TCP连接已断开！', { modal: true, detail: '请检查您的登录状态' });
        this.messageProvider.addMessage('⚠️ 您的账号在别处登录，所有TCP连接已断开！');
        this.stopReconnect();
        this._isReconnecting = false;
        this.reconnectAttempts = this.maxReconnectAttempts;
    }

    /**
     * 🚀 性能监控：获取性能报告
     */
    public getPerformanceReport(): string {
        const report = this.performanceMonitor.generateReport();
        return this.performanceMonitor.formatReport(report);
    }

    /**
     * 🚀 性能监控：获取性能摘要
     */
    public getPerformanceSummary(): string {
        return this.performanceMonitor.getSummary();
    }

    /**
     * 🚀 性能监控：检查性能问题
     */
    public checkPerformanceIssues(): string[] {
        return this.performanceMonitor.checkPerformanceIssues();
    }

    /**
     * 🚀 性能监控：重置性能指标
     */
    public resetPerformanceMetrics(): void {
        this.performanceMonitor.reset();
    }
}
