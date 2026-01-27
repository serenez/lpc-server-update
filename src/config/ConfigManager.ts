import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { LogManager, LogLevel } from '../log/LogManager';

export interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    encoding: 'UTF8' | 'GBK';
    loginKey: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
    connection: {
        timeout: number;
        maxRetries: number;
        retryInterval: number;
        heartbeatInterval: number;
    };
    loginWithEmail: boolean;
}

export class ConfigManager {
    private static instance: ConfigManager;
    private eventEmitter: EventEmitter;
    private configPath: string;
    private config: Config;
    private static hasShownInitialLog = false; // 使用静态变量跟踪是否显示过初始日志
    private disposables: vscode.Disposable[] = [];
    private isWatchingConfig: boolean = false; // 🚀 跟踪是否已在监听配置文件
    
    private constructor() {
        this.eventEmitter = new EventEmitter();
        this.configPath = this.getConfigPath();

        try {
            // 🚀 优化：延迟创建配置文件，只在配置文件存在时才加载
            if (fs.existsSync(this.configPath)) {
                // 加载配置
                this.config = this.loadConfig();
                // 🚀 立即启动配置文件监听器（如果配置文件已存在）
                this.watchConfig();
            } else {
                // 配置文件不存在，创建最小化的内存配置
                this.config = this.createMinimalConfig() as Config;
            }

            // 监听VS Code配置变化
            this.disposables.push(
                vscode.workspace.onDidChangeConfiguration(e => {
                    if (e.affectsConfiguration('gameServerCompiler')) {
                        this.syncVSCodeConfig();
                    }
                })
            );

            // 初始同步VS Code配置
            this.syncVSCodeConfig();
        } catch (error) {
            const logger = LogManager.getInstance();
            logger.log(`配置初始化失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    // 获取配置
    getConfig(): Config {
        return { ...this.config };
    }

    // 更新配置
    async updateConfig(newConfig: Partial<Config>): Promise<void> {
        const oldConfig = { ...this.config };
        this.config = { ...this.config, ...newConfig };
        await this.saveConfig();
        this.eventEmitter.emit('configChanged', { oldConfig, newConfig: this.config });
    }

    // 监听配置变化
    onConfigChanged(listener: (event: {oldConfig: Config, newConfig: Config}) => void): void {
        this.eventEmitter.on('configChanged', listener);
    }

    private getConfigPath(): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            throw new Error('未找到工作区目录');
        }
        return path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
    }

    /**
     * 🚀 延迟创建配置文件（在连接时调用）
     */
    public async ensureConfigExists(): Promise<void> {
        const logger = LogManager.getInstance();

        try {
            // 如果配置文件已经存在，直接返回
            if (fs.existsSync(this.configPath)) {
                // 如果还没有监听配置文件变化，开始监听
                this.watchConfig();
                return;
            }

            // 确保.vscode目录存在
            const vscodeDir = path.dirname(this.configPath);
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
                logger.log('创建.vscode目录', LogLevel.INFO);
            }

            // 创建默认配置文件
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const defaultConfig = {
                host: '',
                port: 0,
                username: '',
                password: '',
                rootPath: workspaceRoot,
                serverKey: 'buyi-SerenezZmuy',
                encoding: 'UTF8',
                loginKey: 'buyi-ZMuy',
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
                },
                loginWithEmail: false
            };

            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
            logger.log('创建默认配置文件', LogLevel.INFO);

            // 更新内存中的配置
            this.config = defaultConfig as Config;

            // 开始监听配置文件变化
            this.watchConfig();
        } catch (error) {
            logger.log(`确保配置文件失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    /**
     * 🚀 重置项目路径
     */
    public async resetRootPath(): Promise<void> {
        const logger = LogManager.getInstance();

        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
            if (!workspaceRoot) {
                throw new Error('未找到工作区目录');
            }

            const oldRootPath = this.config.rootPath;
            this.config.rootPath = workspaceRoot;

            await this.saveConfig();

            logger.log(`项目路径已重置`, LogLevel.INFO);
            logger.log(`旧路径: ${oldRootPath}`, LogLevel.INFO);
            logger.log(`新路径: ${workspaceRoot}`, LogLevel.INFO);

            vscode.window.showInformationMessage(
                `项目路径已更新\n旧路径: ${oldRootPath}\n新路径: ${workspaceRoot}`
            );
        } catch (error) {
            logger.log(`重置项目路径失败: ${error}`, LogLevel.ERROR);
            vscode.window.showErrorMessage(`重置项目路径失败: ${error}`);
            throw error;
        }
    }

    /**
     * 🚀 创建最小化的内存配置（配置文件不存在时使用）
     */
    private createMinimalConfig(): any {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        return {
            host: '',
            port: 0,
            username: '',
            password: '',
            rootPath: workspaceRoot || '',
            serverKey: 'buyi-SerenezZmuy',
            encoding: 'UTF8',
            loginKey: 'buyi-ZMuy',
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
            },
            loginWithEmail: false
        };
    }

    private loadConfig(): Config {
        const logger = LogManager.getInstance();
        
        try {
            // 验证配置文件是否存在
            if (!fs.existsSync(this.configPath)) {
                throw new Error('配置文件不存在');
            }

            // 读取配置文件
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            // 验证必要的配置字段
            const requiredFields = ['rootPath', 'serverKey', 'encoding', 'loginKey'];
            const missingFields = requiredFields.filter(field => !config[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`配置文件缺少必要字段: ${missingFields.join(', ')}`);
            }

            // 只在第一次显示日志
            if (!ConfigManager.hasShownInitialLog) {
                this.logInitialConfig(config);
                ConfigManager.hasShownInitialLog = true;
            }

            return config;
        } catch (error) {
            logger.log(`配置加载失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    private async saveConfig(): Promise<void> {
        try {
            await fs.promises.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
        } catch (error) {
            const logger = LogManager.getInstance();
            logger.log(`保存配置失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    private watchConfig(): void {
        // 🚀 避免重复启动监听器
        if (this.isWatchingConfig) {
            return;
        }

        const logger = LogManager.getInstance();
        let fsWait: NodeJS.Timeout | null = null;

        try {
            logger.log('开始监听配置文件变化', LogLevel.INFO);
            this.isWatchingConfig = true;
            fs.watch(this.configPath, (event, filename) => {
                logger.log(`配置文件变化事件: ${event}`, LogLevel.DEBUG);
                if (filename) {
                    if (fsWait) return;
                    fsWait = setTimeout(() => {
                        fsWait = null;
                    }, 200); // 🚀 增加延迟到200ms，确保文件写入完成

                    try {
                        // 🚀 检查文件是否存在且有大小（避免读取空文件）
                        const stats = fs.statSync(this.configPath);
                        if (!stats || stats.size === 0) {
                            logger.log('配置文件大小为0，跳过读取', LogLevel.DEBUG);
                            return;
                        }

                        const configData = fs.readFileSync(this.configPath, 'utf8');
                        // 🚀 检查文件内容是否为空或空白（VS Code 保存时会先清空文件）
                        if (!configData || configData.trim() === '') {
                            logger.log('配置文件为空，跳过读取', LogLevel.DEBUG);
                            return;
                        }
                        const newConfig = JSON.parse(configData);

                        // 🚀 调试：输出读取到的配置
                        logger.log(`读取到新配置 rootPath: ${newConfig.rootPath}`, LogLevel.DEBUG);
                        logger.log(`当前内存中 rootPath: ${this.config.rootPath}`, LogLevel.DEBUG);

                        // 检查具体哪些配置发生了变化
                        const changes: string[] = [];
                        if (newConfig.rootPath !== this.config.rootPath) {
                            changes.push(`项目路径已更改: ${this.config.rootPath} -> ${newConfig.rootPath}`);
                        }
                        if (newConfig.host !== this.config.host) {
                            changes.push(`服务器地址已更改: ${newConfig.host}`);
                        }
                        if (newConfig.port !== this.config.port) {
                            changes.push(`服务器端口已更改: ${newConfig.port}`);
                        }
                        if (newConfig.encoding !== this.config.encoding) {
                            changes.push(`编码已更改: ${newConfig.encoding}`);
                        }
                        if (newConfig.loginKey !== this.config.loginKey) {
                            changes.push(`登录KEY已更改: ${newConfig.loginKey}`);
                        }
                        if (newConfig.loginWithEmail !== this.config.loginWithEmail) {
                            changes.push(`登录方式已更改: ${newConfig.loginWithEmail ? '包含' : '不包含'}邮箱`);
                        }
                        if (newConfig.compile?.autoCompileOnSave !== this.config.compile?.autoCompileOnSave) {
                            changes.push(`自动编译已${newConfig.compile?.autoCompileOnSave ? '开启' : '关闭'}`);
                        }

                        // 🚀 只要有文件变化就更新配置（不仅仅是在changes.length > 0时）
                        const oldConfig = { ...this.config };
                        this.config = { ...this.config, ...newConfig };

                        // 记录变化的配置项
                        if (changes.length > 0) {
                            changes.forEach(change => {
                                logger.log(change, LogLevel.INFO);
                            });

                            this.eventEmitter.emit('configChanged', {
                                oldConfig,
                                newConfig: this.config,
                                changes
                            });
                        } else {
                            logger.log('配置文件已重新加载（无变化）', LogLevel.DEBUG);
                        }
                    } catch (error) {
                        // 🚀 只在真正读取失败时输出错误日志，跳过JSON解析错误（文件保存过程中的正常现象）
                        if (!(error instanceof SyntaxError && error.message.includes('JSON'))) {
                            logger.log(`配置文件读取失败: ${error}`, LogLevel.ERROR);
                        }
                    }
                }
            });
        } catch (error) {
            logger.log(`监听配置文件失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    private logInitialConfig(config: Config): void {
        const logger = LogManager.getInstance();
        logger.log('配置文件加载成功', LogLevel.INFO);
        logger.log(`工作区目录: ${config.rootPath}`, LogLevel.INFO);
        logger.log(`当前编码: ${config.encoding}`, LogLevel.INFO);
        logger.log(`当前登录KEY: ${config.loginKey}`, LogLevel.INFO);
        logger.log(`登录信息${config.loginWithEmail ? '包含' : '不包含'}邮箱`, LogLevel.INFO);
    }

    // 同步VS Code配置
    private syncVSCodeConfig(): void {
        const vsCodeConfig = vscode.workspace.getConfiguration('gameServerCompiler');
        const autoCompileOnSave = vsCodeConfig.get<boolean>('compile.autoCompileOnSave');
        
        if (autoCompileOnSave !== undefined && 
            autoCompileOnSave !== this.config.compile.autoCompileOnSave) {
            this.updateConfig({
                compile: {
                    ...this.config.compile,
                    autoCompileOnSave
                }
            });
        }
    }

    private getRootPath(): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
        if (!workspaceRoot) {
            throw new Error('未找到工作区目录');
        }
        return workspaceRoot;
    }

    // 清理资源
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
} 
