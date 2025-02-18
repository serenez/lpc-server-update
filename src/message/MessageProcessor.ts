import { EventEmitter } from 'events';
import { LogManager, LogLevel } from '../log/LogManager';

export interface Message {
  type: MessageType;
  content: string;
  timestamp: Date;
}

export enum MessageType {
  SYSTEM = 'SYSTEM',
  COMPILE = 'COMPILE',
  GAME = 'GAME',
  ERROR = 'ERROR'
}

export class MessageProcessor {
  private readonly messageBuffer: Message[] = [];
  private readonly bufferSize = 1000;
  private readonly eventEmitter = new EventEmitter();
  private readonly logger = LogManager.getInstance();
  private processingTimer: NodeJS.Timeout | null = null;

  processMessage(message: string): void {
    const type = this.getMessageType(message);
    const newMessage: Message = {
      type,
      content: this.cleanMessage(message),
      timestamp: new Date()
    };

    this.messageBuffer.push(newMessage);
    if (this.messageBuffer.length > this.bufferSize) {
      this.messageBuffer.shift();
    }

    this.scheduleProcessing();
  }

  private scheduleProcessing(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }

    this.processingTimer = setTimeout(() => {
      this.processMessageBuffer();
    }, 100);
  }

  private processMessageBuffer(): void {
    const messages = [...this.messageBuffer];
    this.messageBuffer.length = 0;

    for (const message of messages) {
      this.eventEmitter.emit('message', message);
      this.logger.log(message.content, this.getLogLevel(message.type));
    }
  }

  private getMessageType(message: string): MessageType {
    if (message.includes('编译')) return MessageType.COMPILE;
    if (message.includes('错误')) return MessageType.ERROR;
    if (message.startsWith('系统')) return MessageType.SYSTEM;
    return MessageType.GAME;
  }

  private getLogLevel(type: MessageType): LogLevel {
    switch (type) {
      case MessageType.ERROR:
        return LogLevel.ERROR;
      case MessageType.SYSTEM:
        return LogLevel.INFO;
      default:
        return LogLevel.DEBUG;
    }
  }

  private cleanMessage(message: string): string {
    return message
      .replace(/\x1b\[[0-9;]*[mK]/g, '') // 清理ANSI颜色代码
      .replace(/\s+/g, ' ') // 压缩空白字符
      .trim();
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  dispose(): void {
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
    }
    this.eventEmitter.removeAllListeners();
  }
} 
