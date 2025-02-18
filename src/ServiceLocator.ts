import { TcpClient } from './tcpClient';
import { ConfigManager } from './config/ConfigManager';
import { ConnectionState } from './state/ConnectionState';
import { LogManager } from './log/LogManager';
import { CompileManager } from './compile/CompileManager';
import { CommandManager } from './command/CommandManager';
import { MessageHandlerImpl } from './utils/MessageHandler';
import { LogLevel } from './log/LogManager';
import { ButtonProvider } from './buttonProvider';
import { MessageProvider } from './messageProvider';
import * as vscode from 'vscode';

type ServiceType = {
    'tcpClient': TcpClient;
    'configManager': ConfigManager;
    'connectionState': ConnectionState;
    'logManager': LogManager;
    'compileManager': CompileManager;
    'commandManager': CommandManager;
    'messageHandler': MessageHandlerImpl;
    'messageProvider': MessageProvider;
    'buttonProvider': ButtonProvider;
};

export class ServiceLocator {
    private static instance: ServiceLocator | null = null;
    private services: Map<keyof ServiceType, any> = new Map();

    private constructor(private context: vscode.ExtensionContext) {
        this.initializeServices();
    }

    static initializeInstance(context: vscode.ExtensionContext): void {
        if (!ServiceLocator.instance) {
            ServiceLocator.instance = new ServiceLocator(context);
        }
    }

    static getInstance(): ServiceLocator {
        if (!ServiceLocator.instance) {
            throw new Error('ServiceLocator has not been initialized');
        }
        return ServiceLocator.instance;
    }

    private initializeServices() {
        // 按依赖顺序初始化服务
        const logManager = LogManager.getInstance();
        const configManager = ConfigManager.getInstance();
        const connectionState = ConnectionState.getInstance();
        const messageHandler = MessageHandlerImpl.getInstance(logManager);
        
        this.services.set('logManager', logManager);
        this.services.set('configManager', configManager);
        this.services.set('connectionState', connectionState);
        this.services.set('messageHandler', messageHandler);
        
        // 创建消息通道适配器
        const messageChannels = {
            debug: {
                appendLine: (line: string) => logManager.log(line, LogLevel.DEBUG),
                show: () => logManager.showDebugChannel()
            },
            server: {
                appendLine: (line: string) => logManager.log(line, LogLevel.INFO),
                show: () => logManager.showServerChannel()
            }
        };
        
        // 创建MessageProvider实例
        const messageProvider = new MessageProvider(this.context.extensionUri);
        
        // 创建ButtonProvider实例，传入messageProvider
        const buttonProvider = new ButtonProvider(this.context.extensionUri, messageProvider);
        
        this.services.set('messageProvider', messageProvider);
        this.services.set('buttonProvider', buttonProvider);
        
        // 使用ButtonProvider初始化TcpClient
        const tcpClient = new TcpClient(
            messageChannels,
            buttonProvider,  // 替换configManager
            connectionState
        );
        this.services.set('tcpClient', tcpClient);
        
        // 初始化CompileManager
        const compileManager = CompileManager.getInstance();
        this.services.set('compileManager', compileManager);
        
        // 初始化CommandManager
        const commandManager = CommandManager.getInstance(this);
        this.services.set('commandManager', commandManager);
    }

    getService<K extends keyof ServiceType>(name: K): ServiceType[K] {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service ${name} not found`);
        }
        return service as ServiceType[K];
    }

    dispose() {
        // 按依赖顺序反向清理服务
        const services = Array.from(this.services.entries());
        services.reverse().forEach(([name, service]) => {
            if (typeof service.dispose === 'function') {
                service.dispose();
            }
        });
        this.services.clear();
        ServiceLocator.instance = null;
    }
} 
