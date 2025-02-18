import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    loginKey: string;
    loginWithEmail: boolean;
    rootPath: string;
    serverKey: string;
    encoding: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
}

export class ConfigManager {
    private static instance: ConfigManager;
    private config: Config;
    private configWatcher: fs.FSWatcher | null = null;
    private configPath: string;
    private readonly defaultConfig: Config;

    private constructor() {
        this.configPath = this.getConfigPath();
        this.defaultConfig = {
            host: '',
            port: 0,
            username: '',
            password: '',
            loginKey: 'buyi-ZMuy',
            loginWithEmail: false,
            rootPath: this.getWorkspaceRoot(),
            serverKey: 'buyi-SerenezZmuy',
            encoding: 'UTF8',
            compile: {
                defaultDir: '',
                autoCompileOnSave: false,
                timeout: 30000,
                showDetails: true
            }
        };
        this.config = this.loadConfig();
        this.watchConfig();
    }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private getWorkspaceRoot(): string {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '';
        
        // 如果路径包含 .vscode，则返回其父目录
        if (workspaceRoot.endsWith('.vscode')) {
            return path.dirname(workspaceRoot);
        }
        
        return workspaceRoot;
    }

    private getConfigPath(): string {
        const workspaceRoot = this.getWorkspaceRoot();
        // 确保配置文件总是在 .vscode 目录下
        return path.join(workspaceRoot, '.vscode', 'muy-lpc-update.json');
    }

    private loadConfig(): Config {
        try {
            if (fs.existsSync(this.configPath)) {
                const configData = fs.readFileSync(this.configPath, 'utf8');
                const loadedConfig = JSON.parse(configData);
                return { ...this.defaultConfig, ...loadedConfig };
            }
            return this.defaultConfig;
        } catch (error) {
            console.error('加载配置失败:', error);
            return this.defaultConfig;
        }
    }

    private watchConfig() {
        if (this.configWatcher) {
            this.configWatcher.close();
        }

        try {
            this.configWatcher = fs.watch(this.configPath, (eventType) => {
                if (eventType === 'change') {
                    this.config = this.loadConfig();
                    this.notifyConfigChange();
                }
            });
        } catch (error) {
            console.error('监听配置文件失败:', error);
        }
    }

    getConfig(): Config {
        return { ...this.config };
    }

    async updateConfig(newConfig: Partial<Config>): Promise<void> {
        try {
            this.config = { ...this.config, ...newConfig };
            await fs.promises.writeFile(
                this.configPath,
                JSON.stringify(this.config, null, 2)
            );
            this.notifyConfigChange();
        } catch (error) {
            console.error('更新配置失败:', error);
            throw error;
        }
    }

    private notifyConfigChange() {
        vscode.commands.executeCommand('gameServerCompiler.configChanged', this.config);
    }

    dispose() {
        if (this.configWatcher) {
            this.configWatcher.close();
            this.configWatcher = null;
        }
    }
} 
