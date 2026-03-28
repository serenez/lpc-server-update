import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { LogManager, LogLevel } from '../log/LogManager';
import { normalizeConfigToV2 } from './configNormalizer';

// 🚀 Profile接口 - 单个配置环境的完整定义
export interface Profile {
    name: string;
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    encoding: 'UTF8' | 'GBK';
    loginKey: string;
    loginWithEmail: boolean;
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
}

// 🚀 ConfigV2接口 - 新的配置文件格式（version 2）
export interface ConfigV2 {
    version: number;
    activeProfile: string;
    profiles: Record<string, Profile>;
    customCommands?: unknown[];
    customEvals?: unknown[];
    favoriteFiles?: unknown[];
    [key: string]: unknown;
}

export interface ConfigAuxiliaryData {
    customCommands?: unknown[];
    customEvals?: unknown[];
    favoriteFiles?: unknown[];
}

// 🚀 保持向后兼容 - Config类型等同于Profile
export type Config = Profile;

export class ConfigManager {
    private static instance: ConfigManager | undefined;
    private eventEmitter: EventEmitter;
    private profileEventEmitter: EventEmitter; // 🚀 新增：配置切换事件
    private configPath: string;
    private config: ConfigV2; // 🚀 改为ConfigV2类型
    private static hasShownInitialLog = false; // 使用静态变量跟踪是否显示过初始日志
    private disposables: vscode.Disposable[] = [];
    private isWatchingConfig: boolean = false; // 🚀 跟踪是否已在监听配置文件
    private lastConfigMtime: number = 0; // 🚀 记录最后修改时间
    private configReloadTimer: NodeJS.Timeout | null = null; // 防抖定时器
    private saveQueue: Promise<void> = Promise.resolve();
    private disposed: boolean = false;

    private constructor() {
        this.eventEmitter = new EventEmitter();
        this.profileEventEmitter = new EventEmitter(); // 🚀 初始化配置切换事件发射器
        this.configPath = this.getConfigPath();

        try {
            // 🚀 优化：延迟创建配置文件，只在配置文件存在时才加载
            if (fs.existsSync(this.configPath)) {
                // 加载配置并迁移
                let loadedConfig = this.loadConfig();
                this.config = this.migrateFromV1(loadedConfig);
                // 🚀 立即启动配置文件监听器（如果配置文件已存在）
                this.watchConfig();
            } else {
                // 配置文件不存在，创建最小化的内存配置
                const minimalConfig = this.createMinimalConfig() as any;
                this.config = {
                    version: 2,
                    activeProfile: 'default',
                    profiles: {
                        default: minimalConfig
                    }
                };
            }

            // 监听VS Code配置变化
            this.disposables.push(
                vscode.workspace.onDidChangeConfiguration(e => {
                    if (e.affectsConfiguration('gameServerCompiler')) {
                        void this.syncVSCodeConfig();
                    }
                })
            );

            // 初始同步VS Code配置
            void this.syncVSCodeConfig();
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

    // 🚀 获取配置 - 保持向后兼容，返回当前激活的配置
    getConfig(): Config {
        const configV2 = this.config as ConfigV2;
        const activeProfile = configV2.profiles[configV2.activeProfile];
        return this.cloneValue(activeProfile);
    }

    getConfigSnapshot(): ConfigV2 {
        return this.cloneValue(this.config);
    }

    getAuxiliaryData(): ConfigAuxiliaryData {
        return {
            customCommands: this.cloneValue(this.config.customCommands ?? []),
            customEvals: this.cloneValue(this.config.customEvals ?? []),
            favoriteFiles: this.cloneValue(this.config.favoriteFiles ?? [])
        };
    }

    // 🚀 更新配置 - 更新当前激活的配置
    async updateConfig(newConfig: Partial<Config>): Promise<void> {
        const configV2 = this.config as ConfigV2;
        const activeProfileId = configV2.activeProfile;
        const currentProfile = this.cloneValue(configV2.profiles[activeProfileId]);
        const updatedProfile = { ...currentProfile, ...newConfig };

        const oldConfig = this.cloneValue(currentProfile);
        configV2.profiles[activeProfileId] = updatedProfile;
        await this.saveConfig();
        this.emitConfigChanged(oldConfig);
    }

    async updateAuxiliaryData(newData: ConfigAuxiliaryData): Promise<void> {
        const oldConfig = this.getConfig();
        if (newData.customCommands !== undefined) {
            this.config.customCommands = this.cloneValue(newData.customCommands);
        }
        if (newData.customEvals !== undefined) {
            this.config.customEvals = this.cloneValue(newData.customEvals);
        }
        if (newData.favoriteFiles !== undefined) {
            this.config.favoriteFiles = this.cloneValue(newData.favoriteFiles);
        }

        await this.saveConfig();
        this.emitConfigChanged(oldConfig);
    }

    // 🚀 ========== 新增：多配置支持方法 ==========

    /**
     * 🚀 获取所有配置
     */
    getAllProfiles(): Record<string, Profile> {
        return this.cloneValue(this.config.profiles);
    }

    /**
     * 🚀 获取指定配置
     */
    getProfile(profileId: string): Profile | null {
        const profile = this.config.profiles[profileId];
        return profile ? this.cloneValue(profile) : null;
    }

    /**
     * 🚀 获取当前激活的配置ID
     */
    getActiveProfileId(): string {
        return this.config.activeProfile;
    }

    /**
     * 🚀 切换当前激活的配置
     */
    async switchProfile(profileId: string): Promise<void> {
        if (!this.config.profiles[profileId]) {
            throw new Error(`配置不存在: ${profileId}`);
        }

        const oldProfile = this.config.activeProfile;
        const oldConfig = this.getConfig();
        this.config.activeProfile = profileId;
        await this.saveConfig();
        this.emitConfigChanged(oldConfig);

        // 🚀 触发配置切换事件
        this.profileEventEmitter.emit('profileChanged', {
            oldProfile,
            newProfile: profileId
        });
    }

    /**
     * 🚀 添加新配置
     */
    async addProfile(profileId: string, profile: Profile): Promise<void> {
        if (this.config.profiles[profileId]) {
            throw new Error(`配置ID已存在: ${profileId}`);
        }

        const oldConfig = this.getConfig();
        this.config.profiles[profileId] = profile;
        await this.saveConfig();
        this.emitConfigChanged(oldConfig);
    }

    /**
     * 🚀 更新指定配置
     */
    async updateProfile(profileId: string, profile: Partial<Profile>): Promise<void> {
        if (!this.config.profiles[profileId]) {
            throw new Error(`配置不存在: ${profileId}`);
        }

        const oldConfig = this.getConfig();
        const currentProfile = this.cloneValue(this.config.profiles[profileId]);
        this.config.profiles[profileId] = { ...currentProfile, ...profile };
        await this.saveConfig();
        this.emitConfigChanged(oldConfig);
    }

    /**
     * 🚀 删除配置
     */
    async deleteProfile(profileId: string): Promise<void> {
        if (Object.keys(this.config.profiles).length <= 1) {
            throw new Error('至少需要保留一个配置');
        }

        if (!this.config.profiles[profileId]) {
            throw new Error(`配置不存在: ${profileId}`);
        }

        const oldConfig = this.getConfig();
        delete this.config.profiles[profileId];

        // 如果删除的是当前激活的配置，切换到第一个可用配置
        if (this.config.activeProfile === profileId) {
            const remainingIds = Object.keys(this.config.profiles);
            this.config.activeProfile = remainingIds[0];
        }

        await this.saveConfig();
        this.emitConfigChanged(oldConfig);
    }

    /**
     * 🚀 监听配置切换事件
     */
    onProfileChanged(listener: (event: {oldProfile: string, newProfile: string}) => void): vscode.Disposable {
        this.profileEventEmitter.on('profileChanged', listener);
        return new vscode.Disposable(() => {
            this.profileEventEmitter.removeListener('profileChanged', listener);
        });
    }

    /**
     * 🚀 从版本1迁移配置到版本2
     */
    private migrateFromV1(oldConfig: any): ConfigV2 {
        const logger = LogManager.getInstance();
        const normalized = normalizeConfigToV2(oldConfig);
        const migratedConfig = normalized.config as ConfigV2;

        if (normalized.migrated) {
            logger.log('检测到旧版或异常配置结构，已自动转换为版本2格式', LogLevel.INFO);
            try {
                fs.writeFileSync(this.configPath, JSON.stringify(migratedConfig, null, 2), 'utf8');
                logger.log('配置文件已更新为版本2格式', LogLevel.INFO);
            } catch (error) {
                logger.log(`保存迁移配置失败: ${error}`, LogLevel.ERROR);
            }
        }

        return migratedConfig;
    }

    // 监听配置变化
    onConfigChanged(listener: (event: {oldConfig: Config, newConfig: Config}) => void): vscode.Disposable {
        this.eventEmitter.on('configChanged', listener);
        return new vscode.Disposable(() => {
            this.eventEmitter.removeListener('configChanged', listener);
        });
    }

    private cloneValue<T>(value: T): T {
        if (value === undefined || value === null) {
            return value;
        }
        return JSON.parse(JSON.stringify(value)) as T;
    }

    private emitConfigChanged(oldConfig: Config): void {
        this.eventEmitter.emit('configChanged', {
            oldConfig: this.cloneValue(oldConfig),
            newConfig: this.getConfig()
        });
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

            const defaultProfile = this.createMinimalConfig() as Profile;
            const defaultConfig: ConfigV2 = {
                version: 2,
                activeProfile: 'default',
                profiles: {
                    default: defaultProfile
                }
            };

            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
            logger.log('创建默认配置文件', LogLevel.INFO);

            this.config = defaultConfig;

            // 开始监听配置文件变化
            this.watchConfig();
        } catch (error) {
            logger.log(`确保配置文件失败: ${error}`, LogLevel.ERROR);
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

    private loadConfig(): any {
        const logger = LogManager.getInstance();

        try {
            // 验证配置文件是否存在
            if (!fs.existsSync(this.configPath)) {
                throw new Error('配置文件不存在');
            }

            // 读取配置文件
            const configData = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configData);

            // 🚀 先归一化，避免 v2-like（缺少version）被误判为v1
            const normalized = normalizeConfigToV2(config);
            const normalizedConfig = normalized.config;

            // 🚀 验证必要的配置字段
            const requiredFields = ['serverKey', 'encoding', 'loginKey'];
            const active = normalizedConfig.profiles[normalizedConfig.activeProfile];
            if (!active) {
                throw new Error('配置文件中没有有效的配置');
            }
            const missingFields = requiredFields.filter(field => !(active as any)[field]);
            if (missingFields.length > 0) {
                throw new Error(`配置文件缺少必要字段: ${missingFields.join(', ')}`);
            }

            // 只在第一次显示日志
            if (!ConfigManager.hasShownInitialLog) {
                this.logInitialConfig(normalizedConfig);
                ConfigManager.hasShownInitialLog = true;
            }

            return config;
        } catch (error) {
            logger.log(`配置加载失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    private async saveConfig(): Promise<void> {
        const serializedConfig = JSON.stringify(this.config, null, 2);
        const writeTask = this.saveQueue.then(async () => {
            try {
                await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
                await fs.promises.writeFile(this.configPath, serializedConfig);
            } catch (error) {
                const logger = LogManager.getInstance();
                logger.log(`保存配置失败: ${error}`, LogLevel.ERROR);
                throw error;
            }
        });

        this.saveQueue = writeTask.catch(() => {});
        await writeTask;
    }

    private watchConfig(): void {
        // 🚀 避免重复启动监听器
        if (this.disposed || this.isWatchingConfig) {
            return;
        }

        const logger = LogManager.getInstance();

        try {
            // 初始化最后修改时间
            try {
                const stats = fs.statSync(this.configPath);
                this.lastConfigMtime = stats.mtimeMs;
            } catch (error) {
                // 文件不存在，使用0
                this.lastConfigMtime = 0;
            }

            logger.log('开始监听配置文件变化', LogLevel.INFO);
            this.isWatchingConfig = true;

            // 🚀 使用 fs.watchFile 替代 fs.watch，监听文件的修改时间戳
            fs.watchFile(this.configPath, { persistent: false, interval: 1000 }, (curr, prev) => {
                if (this.disposed) {
                    return;
                }
                // 检查文件的修改时间是否真的变化了
                if (curr.mtimeMs === this.lastConfigMtime) {
                    return; // 没有变化，跳过
                }

                logger.log(`配置文件已修改，新的修改时间: ${new Date(curr.mtimeMs).toISOString()}`, LogLevel.DEBUG);

                // 检查文件是否有效（大小大于0）
                if (curr.size === 0) {
                    logger.log('配置文件大小为0，等待文件写入完成', LogLevel.DEBUG);
                    return;
                }

                // 防抖：如果已经有定时器在运行，取消它
                if (this.configReloadTimer) {
                    clearTimeout(this.configReloadTimer);
                }

                // 延迟100ms后重新加载配置（确保文件写入完成）
                this.configReloadTimer = setTimeout(() => {
                    this.reloadConfigFromFile();
                    this.configReloadTimer = null;
                }, 100);
            });
        } catch (error) {
            logger.log(`监听配置文件失败: ${error}`, LogLevel.ERROR);
            throw error;
        }
    }

    /**
     * 🚀 从文件重新加载配置
     */
    private reloadConfigFromFile(): void {
        const logger = LogManager.getInstance();

        try {
            const previousSnapshot = this.getConfigSnapshot();
            const oldProfileId = previousSnapshot.activeProfile;
            const oldConfig = this.getConfig();

            // 读取文件
            const configData = fs.readFileSync(this.configPath, 'utf8');
            if (!configData || configData.trim() === '') {
                logger.log('配置文件为空，跳过重新加载', LogLevel.DEBUG);
                return;
            }

            const newConfig = JSON.parse(configData);
            const migratedConfig = this.migrateFromV1(newConfig);

            // 更新最后修改时间
            const stats = fs.statSync(this.configPath);
            this.lastConfigMtime = stats.mtimeMs;

            // 检查配置是否真的变化了
            const activeProfile = migratedConfig.activeProfile;
            const newProfile = migratedConfig.profiles[activeProfile];
            const currentProfile = this.config.profiles[this.config.activeProfile];

            const changes: string[] = [];

            // 检查activeProfile是否变化
            if (migratedConfig.activeProfile !== this.config.activeProfile) {
                changes.push(`配置环境已切换: ${this.config.activeProfile} -> ${migratedConfig.activeProfile}`);
            }

            // 检查当前激活的配置内容是否变化
            if (newProfile && currentProfile) {
                if (newProfile.rootPath !== currentProfile.rootPath) {
                    changes.push(`项目路径已更改: ${currentProfile.rootPath} -> ${newProfile.rootPath}`);
                }
                if (newProfile.host !== currentProfile.host) {
                    changes.push(`服务器地址已更改: ${currentProfile.host} -> ${newProfile.host}`);
                }
                if (newProfile.port !== currentProfile.port) {
                    changes.push(`服务器端口已更改: ${currentProfile.port} -> ${newProfile.port}`);
                }
                if (newProfile.encoding !== currentProfile.encoding) {
                    changes.push(`编码已更改: ${newProfile.encoding}`);
                }
                if (newProfile.loginKey !== currentProfile.loginKey) {
                    changes.push(`登录KEY已更改: ${newProfile.loginKey}`);
                }
                if (newProfile.loginWithEmail !== currentProfile.loginWithEmail) {
                    changes.push(`登录方式已更改: ${newProfile.loginWithEmail ? '包含' : '不包含'}邮箱`);
                }
                if (newProfile.compile?.autoCompileOnSave !== currentProfile.compile?.autoCompileOnSave) {
                    changes.push(`自动编译已${newProfile.compile?.autoCompileOnSave ? '开启' : '关闭'}`);
                }
            }

            // 更新配置
            this.config = migratedConfig;
            const hasStructuralChange =
                JSON.stringify(previousSnapshot) !== JSON.stringify(migratedConfig);

            // 记录变化的配置项
            if (hasStructuralChange) {
                changes.forEach(change => {
                    logger.log(change, LogLevel.INFO);
                });

                // 如果activeProfile变化了，触发profileChanged事件
                if (oldProfileId !== this.config.activeProfile) {
                    this.profileEventEmitter.emit('profileChanged', {
                        oldProfile: oldProfileId,
                        newProfile: this.config.activeProfile
                    });
                }

                this.emitConfigChanged(oldConfig);

                logger.log('配置文件已重新加载并更新', LogLevel.INFO);
            } else {
                logger.log('配置文件已重新加载（无变化）', LogLevel.DEBUG);
            }
        } catch (error) {
            // 只在真正读取失败时输出错误日志，跳过JSON解析错误（文件保存过程中的正常现象）
            if (!(error instanceof SyntaxError && error.message.includes('JSON'))) {
                logger.log(`配置文件读取失败: ${error}`, LogLevel.ERROR);
            }
        }
    }

    private logInitialConfig(config: any): void {
        const logger = LogManager.getInstance();
        logger.log('配置文件加载成功', LogLevel.INFO);

        // 🚀 兼容版本1和版本2格式
        let profile: any;
        let profileName: string;

        if (config.version >= 2 && config.profiles) {
            profile = config.profiles[config.activeProfile];
            profileName = profile?.name || config.activeProfile;
            logger.log(`当前配置: ${profileName} (${config.activeProfile})`, LogLevel.INFO);
        } else {
            profile = config;
            profileName = '默认配置';
            logger.log(`当前配置: ${profileName}`, LogLevel.INFO);
        }

        if (profile) {
            logger.log(`工作区目录: ${profile.rootPath}`, LogLevel.INFO);
            logger.log(`当前编码: ${profile.encoding}`, LogLevel.INFO);
            logger.log(`当前登录KEY: ${profile.loginKey}`, LogLevel.INFO);
            logger.log(`登录信息${profile.loginWithEmail ? '包含' : '不包含'}邮箱`, LogLevel.INFO);
        }
    }

    // 同步VS Code配置
    private async syncVSCodeConfig(): Promise<void> {
        try {
            const vsCodeConfig = vscode.workspace.getConfiguration('gameServerCompiler');
            const autoCompileOnSave = vsCodeConfig.get<boolean>('compile.autoCompileOnSave');

            // 🚀 从当前激活的配置中获取
            const activeProfileId = this.config.activeProfile;
            const currentAutoCompile = this.config.profiles[activeProfileId].compile.autoCompileOnSave;

            if (autoCompileOnSave !== undefined && autoCompileOnSave !== currentAutoCompile) {
                await this.updateConfig({
                    compile: {
                        ...this.config.profiles[activeProfileId].compile,
                        autoCompileOnSave
                    }
                });
            }
        } catch (error) {
            LogManager.getInstance().log(`同步 VS Code 配置失败: ${error}`, LogLevel.ERROR);
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
        if (this.disposed) {
            return;
        }
        this.disposed = true;

        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        // 🚀 清理防抖定时器
        if (this.configReloadTimer) {
            clearTimeout(this.configReloadTimer);
            this.configReloadTimer = null;
        }

        // 🚀 停止监听配置文件
        if (this.isWatchingConfig) {
            fs.unwatchFile(this.configPath);
            this.isWatchingConfig = false;
        }

        this.eventEmitter.removeAllListeners();
        this.profileEventEmitter.removeAllListeners();
        ConfigManager.instance = undefined;
    }
}
