import * as vscode from 'vscode';

// 创建统一的配置管理类
export class ConfigManager {
    private static instance: ConfigManager;
    
    public getConfig<T>(key: string, defaultValue: T): T {
        return vscode.workspace.getConfiguration('gameServerCompiler').get<T>(key, defaultValue);
    }
    
    public async updateConfig(key: string, value: any) {
        await vscode.workspace.getConfiguration('gameServerCompiler').update(key, value, true);
    }
} 
