import { LogLevel } from '../log/LogManager';
import { IDisposable } from '../interfaces/IDisposable';
import { ConfigError, NetworkError } from '../errors';

export interface MessageProcessor {
    log(message: string, level: LogLevel, context?: string): void;
}

export interface MessageResult {
    type: MessageType;
    content: string;
    success: boolean;
    data?: any;
}

export enum MessageType {
    MUY = 'MUY',
    PROTOCOL = 'PROTOCOL',
    NORMAL = 'NORMAL',
    COMPILE = 'COMPILE',
    AUTH = 'AUTH',
    ERROR = 'ERROR'
}

interface MessageHandler {
    handleMessage(message: string): MessageResult;
}

export class MessageHandlerImpl implements MessageHandler, IDisposable {
    private static instance: MessageHandlerImpl | null = null;
    private handlers: Map<MessageType, (message: string) => MessageResult>;
    private processor: MessageProcessor;
    private readonly ESC = '\x1b';

    private constructor(processor: MessageProcessor) {
        this.processor = processor;
        this.handlers = new Map();
        this.registerDefaultHandlers();
    }

    static getInstance(processor: MessageProcessor): MessageHandlerImpl {
        if (MessageHandlerImpl.instance === null) {
            MessageHandlerImpl.instance = new MessageHandlerImpl(processor);
        }
        return MessageHandlerImpl.instance;
    }

    registerHandler(type: MessageType, handler: (message: string) => MessageResult): void {
        this.handlers.set(type, handler);
    }

    handleMessage(message: string): MessageResult {
        try {
            const type = this.getMessageType(message);
            const handler = this.handlers.get(type);
            
            if (handler) {
                const result = handler(message);
                this.processor.log(
                    `处理${type}消息: ${result.success ? '成功' : '失败'}`,
                    result.success ? LogLevel.DEBUG : LogLevel.ERROR,
                    'MessageHandler'
                );
                return result;
            } else {
                this.processor.log(`未找到消息处理器: ${type}`, LogLevel.DEBUG, 'MessageHandler');
                return {
                    type,
                    content: message,
                    success: false,
                    data: null
                };
            }
        } catch (error) {
            this.processor.log(`处理消息失败: ${error}`, LogLevel.ERROR, 'MessageHandler');
            return {
                type: MessageType.ERROR,
                content: message,
                success: false,
                data: error
            };
        }
    }

    private getMessageType(message: string): MessageType {
        if (message.startsWith(`${this.ESC}MUY`)) return MessageType.MUY;
        if (message.match(/^\x1b\d{3}/)) return MessageType.PROTOCOL;
        if (message.includes('成功编译') || message.includes('编译失败')) return MessageType.COMPILE;
        if (message.includes('验证失败') || message.includes('登录成功')) return MessageType.AUTH;
        if (message.includes('错误') || message.includes('失败')) return MessageType.ERROR;
        return MessageType.NORMAL;
    }

    private registerDefaultHandlers(): void {
        this.registerHandler(MessageType.MUY, this.handleMuyMessage.bind(this));
        this.registerHandler(MessageType.PROTOCOL, this.handleProtocolMessage.bind(this));
        this.registerHandler(MessageType.COMPILE, this.handleCompileMessage.bind(this));
        this.registerHandler(MessageType.AUTH, this.handleAuthMessage.bind(this));
        this.registerHandler(MessageType.ERROR, this.handleErrorMessage.bind(this));
        this.registerHandler(MessageType.NORMAL, this.handleNormalMessage.bind(this));
    }

    private handleMuyMessage(message: string): MessageResult {
        this.processor.log('处理MUY消息', LogLevel.DEBUG, 'MessageHandler');
        try {
            const content = message.substring(
                message.indexOf('MUY') + 3,
                message.indexOf('║')
            );
            return {
                type: MessageType.MUY,
                content: content.trim(),
                success: true,
                data: this.parseMuyContent(content)
            };
        } catch (error) {
            return {
                type: MessageType.MUY,
                content: message,
                success: false,
                data: error
            };
        }
    }

    private handleProtocolMessage(message: string): MessageResult {
        this.processor.log('处理协议消息', LogLevel.DEBUG, 'MessageHandler');
        const match = message.match(/^\x1b(\d{3})(.*)/);
        if (match) {
            const [, code, content] = match;
            return {
                type: MessageType.PROTOCOL,
                content: content.trim(),
                success: true,
                data: { code, content }
            };
        }
        return {
            type: MessageType.PROTOCOL,
            content: message,
            success: false,
            data: null
        };
    }

    private handleCompileMessage(message: string): MessageResult {
        const success = message.includes('成功编译');
        return {
            type: MessageType.COMPILE,
            content: message,
            success,
            data: { success }
        };
    }

    private handleAuthMessage(message: string): MessageResult {
        const success = message.includes('登录成功');
        if (!success) {
            throw new NetworkError('认证失败: ' + message);
        }
        return {
            type: MessageType.AUTH,
            content: message,
            success,
            data: { success }
        };
    }

    private handleErrorMessage(message: string): MessageResult {
        return {
            type: MessageType.ERROR,
            content: message,
            success: false,
            data: new Error(message)
        };
    }

    private handleNormalMessage(message: string): MessageResult {
        return {
            type: MessageType.NORMAL,
            content: message,
            success: true,
            data: null
        };
    }

    private parseMuyContent(content: string): any {
        // 清理注释和颜色代码
        let cleanContent = content.replace(/\/\*[\s\S]*?\*\//g, '');
        cleanContent = this.cleanColorCodes(cleanContent);
        try {
            return JSON.parse(cleanContent);
        } catch {
            return cleanContent;
        }
    }

    private cleanColorCodes(text: string): string {
        return text.replace(/\x1b\[[0-9;]*[mK]/g, '');
    }

    dispose(): void {
        this.handlers.clear();
        MessageHandlerImpl.instance = null;
    }
} 
