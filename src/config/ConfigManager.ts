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
    
    private constructor() {
        this.eventEmitter = new EventEmitter();
        this.configPath = this.getConfigPath();

        // 确保配置文件存在
        this.ensureConfigExists();

        try {
            // 加载配置
            this.config = this.loadConfig();

            // 确保 rootPath 只在第一次激活时读取
            if (!ConfigManager.hasShownInitialLog) {
                this.config.rootPath = this.getRootPath();
                ConfigManager.hasShownInitialLog = true;
            }

            // 监听配置文件变化
            this.watchConfig();

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

    private ensureConfigExists(): void {
        const logger = LogManager.getInstance();
        
        try {
            // 确保.vscode目录存在
            const vscodeDir = path.dirname(this.configPath);
            if (!fs.existsSync(vscodeDir)) {
                fs.mkdirSync(vscodeDir, { recursive: true });
                logger.log('创建.vscode目录', LogLevel.INFO);
            }

            // 如果配置文件不存在，创建默认配置文件
            if (!fs.existsSync(this.configPath)) {
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
            }
        } catch (error) {
            logger.log(`确保配置文件失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
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
        const logger = LogManager.getInstance();
        let fsWait: NodeJS.Timeout | null = null;

        try {
            fs.watch(this.configPath, (event, filename) => {
                if (filename) {
                    if (fsWait) return;
                    fsWait = setTimeout(() => {
                        fsWait = null;
                    }, 100);

                    try {
                        const configData = fs.readFileSync(this.configPath, 'utf8');
                        const newConfig = JSON.parse(configData);

                        // 检查具体哪些配置发生了变化
                        const changes: string[] = [];
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

                        // 只在有变化时更新并通知
                        if (changes.length > 0) {
                            const oldConfig = { ...this.config };
                            this.config = { ...this.config, ...newConfig };

                            // 记录变化的配置项
                            changes.forEach(change => {
                                logger.log(change, LogLevel.INFO);
                            });

                            this.eventEmitter.emit('configChanged', {
                                oldConfig,
                                newConfig: this.config,
                                changes
                            });
                        }
                    } catch (error) {
                        logger.log(`配置文件读取失败: ${error}`, LogLevel.ERROR);
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
