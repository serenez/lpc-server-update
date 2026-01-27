import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { LogManager, LogLevel } from '../log/LogManager';

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
}

// 🚀 保持向后兼容 - Config类型等同于Profile
export type Config = Profile;

export class ConfigManager {
    private static instance: ConfigManager;
    private eventEmitter: EventEmitter;
    private profileEventEmitter: EventEmitter; // 🚀 新增：配置切换事件
    private configPath: string;
    private config: ConfigV2; // 🚀 改为ConfigV2类型
    private static hasShownInitialLog = false; // 使用静态变量跟踪是否显示过初始日志
    private disposables: vscode.Disposable[] = [];
    private isWatchingConfig: boolean = false; // 🚀 跟踪是否已在监听配置文件
    private lastConfigMtime: number = 0; // 🚀 记录最后修改时间
    private configReloadTimer: NodeJS.Timeout | null = null; // 防抖定时器

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

    // 🚀 获取配置 - 保持向后兼容，返回当前激活的配置
    getConfig(): Config {
        const configV2 = this.config as ConfigV2;
        const activeProfile = configV2.profiles[configV2.activeProfile];
        return { ...activeProfile };
    }

    // 🚀 更新配置 - 更新当前激活的配置
    async updateConfig(newConfig: Partial<Config>): Promise<void> {
        const configV2 = this.config as ConfigV2;
        const activeProfileId = configV2.activeProfile;
        const currentProfile = { ...configV2.profiles[activeProfileId] };
        const updatedProfile = { ...currentProfile, ...newConfig };

        const oldConfig = { ...currentProfile };
        configV2.profiles[activeProfileId] = updatedProfile;
        await this.saveConfig();
        this.eventEmitter.emit('configChanged', { oldConfig, newConfig: updatedProfile });
    }

    // 🚀 ========== 新增：多配置支持方法 ==========

    /**
     * 🚀 获取所有配置
     */
    getAllProfiles(): Record<string, Profile> {
        return { ...this.config.profiles };
    }

    /**
     * 🚀 获取指定配置
     */
    getProfile(profileId: string): Profile | null {
        return this.config.profiles[profileId] || null;
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
        this.config.activeProfile = profileId;
        await this.saveConfig();

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

        this.config.profiles[profileId] = profile;
        await this.saveConfig();
    }

    /**
     * 🚀 更新指定配置
     */
    async updateProfile(profileId: string, profile: Partial<Profile>): Promise<void> {
        if (!this.config.profiles[profileId]) {
            throw new Error(`配置不存在: ${profileId}`);
        }

        const currentProfile = { ...this.config.profiles[profileId] };
        this.config.profiles[profileId] = { ...currentProfile, ...profile };
        await this.saveConfig();
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

        delete this.config.profiles[profileId];

        // 如果删除的是当前激活的配置，切换到第一个可用配置
        if (this.config.activeProfile === profileId) {
            const remainingIds = Object.keys(this.config.profiles);
            this.config.activeProfile = remainingIds[0];
        }

        await this.saveConfig();
    }

    /**
     * 🚀 监听配置切换事件
     */
    onProfileChanged(listener: (event: {oldProfile: string, newProfile: string}) => void): void {
        this.profileEventEmitter.on('profileChanged', listener);
    }

    /**
     * 🚀 从版本1迁移配置到版本2
     */
    private migrateFromV1(oldConfig: any): ConfigV2 {
        // 检测是否已经是版本2
        if (oldConfig.version && oldConfig.version >= 2 && oldConfig.profiles) {
            return oldConfig as ConfigV2;
        }

        const logger = LogManager.getInstance();
        logger.log('检测到旧版本配置文件，开始迁移到版本2', LogLevel.INFO);

        // 迁移为版本2格式
        const migratedConfig: ConfigV2 = {
            version: 2,
            activeProfile: 'default',
            profiles: {
                default: { ...oldConfig }
            }
        };

        // 确保必要字段存在
        if (!migratedConfig.profiles.default.name) {
            migratedConfig.profiles.default.name = '默认配置';
        }

        logger.log('配置迁移完成', LogLevel.INFO);

        // 🚀 立即保存迁移后的配置
        try {
            fs.writeFileSync(this.configPath, JSON.stringify(migratedConfig, null, 2), 'utf8');
            logger.log('配置文件已更新为版本2格式', LogLevel.INFO);
        } catch (error) {
            logger.log(`保存迁移配置失败: ${error}`, LogLevel.ERROR);
        }

        return migratedConfig;
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

            // 🚀 更新内存中的配置（转换为版本2格式）
            this.config = {
                version: 2,
                activeProfile: 'default',
                profiles: {
                    default: defaultConfig as Profile
                }
            };

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

            // 🚀 修改当前激活配置的rootPath
            const activeProfileId = this.config.activeProfile;
            const oldRootPath = this.config.profiles[activeProfileId].rootPath;
            this.config.profiles[activeProfileId].rootPath = workspaceRoot;

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

            // 🚀 验证必要的配置字段（兼容版本1和版本2）
            const requiredFields = ['rootPath', 'serverKey', 'encoding', 'loginKey'];

            // 如果是版本2格式，验证profiles中的字段
            if (config.version >= 2 && config.profiles) {
                const firstProfile = Object.values(config.profiles)[0] as any;
                if (!firstProfile) {
                    throw new Error('配置文件中没有有效的配置');
                }
                const missingFields = requiredFields.filter(field => !firstProfile[field]);
                if (missingFields.length > 0) {
                    throw new Error(`配置文件缺少必要字段: ${missingFields.join(', ')}`);
                }
            } else {
                // 版本1格式，直接验证
                const missingFields = requiredFields.filter(field => !config[field]);
                if (missingFields.length > 0) {
                    throw new Error(`配置文件缺少必要字段: ${missingFields.join(', ')}`);
                }
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
            fs.watchFile(this.configPath, { persistent: true, interval: 1000 }, (curr, prev) => {
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
            const oldConfig = { ...this.config };
            this.config = migratedConfig;

            // 记录变化的配置项
            if (changes.length > 0) {
                changes.forEach(change => {
                    logger.log(change, LogLevel.INFO);
                });

                // 如果activeProfile变化了，触发profileChanged事件
                if (oldConfig.activeProfile !== this.config.activeProfile) {
                    this.profileEventEmitter.emit('profileChanged', {
                        oldProfile: oldConfig.activeProfile,
                        newProfile: this.config.activeProfile
                    });
                }

                this.eventEmitter.emit('configChanged', {
                    oldConfig,
                    newConfig: this.config,
                    changes
                });

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
    private syncVSCodeConfig(): void {
        const vsCodeConfig = vscode.workspace.getConfiguration('gameServerCompiler');
        const autoCompileOnSave = vsCodeConfig.get<boolean>('compile.autoCompileOnSave');

        // 🚀 从当前激活的配置中获取
        const activeProfileId = this.config.activeProfile;
        const currentAutoCompile = this.config.profiles[activeProfileId].compile.autoCompileOnSave;

        if (autoCompileOnSave !== undefined && autoCompileOnSave !== currentAutoCompile) {
            this.updateConfig({
                compile: {
                    ...this.config.profiles[activeProfileId].compile,
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
    }
} 
