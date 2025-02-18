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
    private config: Config;
    private readonly configPath: string;
    private readonly eventEmitter: EventEmitter;
    private static hasShownInitialLog = false; // 使用静态变量跟踪是否显示过初始日志
    
    private constructor() {
        this.eventEmitter = new EventEmitter();
        this.configPath = this.getConfigPath();
        this.config = this.loadConfig();
        this.watchConfig();
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

    private loadConfig(): Config {
        const defaultConfig: Config = {
            host: '',
            port: 0,
            username: '',
            password: '',
            rootPath: path.dirname(this.configPath),
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
                timeout: 10000,        // 连接超时时间(毫秒)
                maxRetries: 3,         // 最大重试次数
                retryInterval: 5000,   // 重试间隔(毫秒)
                heartbeatInterval: 30000 // 心跳包间隔(毫秒)
            },
            loginWithEmail: false
        };

        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const loadedConfig = { ...defaultConfig, ...JSON.parse(configData) };
                
                // 只在第一次显示日志
                if (!ConfigManager.hasShownInitialLog) {
                    this.logInitialConfig(loadedConfig);
                    ConfigManager.hasShownInitialLog = true;
                }
                
                return loadedConfig;
            }
            
            // 只在第一次显示日志
            if (!ConfigManager.hasShownInitialLog) {
                this.logInitialConfig(defaultConfig);
                ConfigManager.hasShownInitialLog = true;
            }
            
            return defaultConfig;
        } catch (error) {
            console.error('加载配置失败:', error);
            return defaultConfig;
        }
    }

    private async saveConfig(): Promise<void> {
        try {
            await fs.promises.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2)
            );
        } catch (error) {
            console.error('保存配置失败:', error);
            throw error;
        }
    }

    private watchConfig(): void {
        let fsWait: NodeJS.Timeout | null = null;
        
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
                        const logger = LogManager.getInstance();
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
                    console.error('配置文件读取失败:', error);
                }
            }
        });
    }

    private logInitialConfig(config: Config): void {
        const logger = LogManager.getInstance();
        logger.log('配置文件加载成功', LogLevel.INFO);
        logger.log(`当前编码: ${config.encoding}`, LogLevel.INFO);
        logger.log(`当前登录KEY: ${config.loginKey}`, LogLevel.INFO);
        logger.log(config.loginWithEmail ? '登录信息包含邮箱' : '登录信息不包含邮箱', LogLevel.INFO);
    }

    dispose(): void {
        this.eventEmitter.removeAllListeners();
    }
} 
