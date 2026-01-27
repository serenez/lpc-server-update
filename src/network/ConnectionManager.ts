import * as net from 'net';
import { EventEmitter } from 'events';
import { LogManager, LogLevel } from '../log/LogManager';
import { ConfigManager } from '../config/ConfigManager';
import { ErrorHandler } from '../errors/ErrorHandler';

export class ConnectionManager {
  private socket: net.Socket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly initialReconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly eventEmitter = new EventEmitter();
  private readonly logger = LogManager.getInstance();
  private readonly config = ConfigManager.getInstance();

  connect(host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new net.Socket();
        this.configureSocket();

        const timeout = setTimeout(() => {
          reject(new Error('连接超时'));
          this.socket?.destroy();
        }, this.config.getConfig().connection.timeout);

        this.socket.connect(port, host, () => {
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          this.logger.log('连接成功', LogLevel.INFO);
          this.eventEmitter.emit('connected');
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private configureSocket(): void {
    if (!this.socket) return;

    this.socket.setKeepAlive(true, 60000);
    this.socket.setNoDelay(true);

    this.socket.on('data', (data) => {
      this.eventEmitter.emit('data', data);
    });

    this.socket.on('error', (error) => {
      ErrorHandler.handle(error, 'ConnectionManager');
      this.eventEmitter.emit('error', error);
    });

    this.socket.on('close', () => {
      this.logger.log('连接关闭', LogLevel.INFO);
      this.eventEmitter.emit('disconnected');
      this.startReconnect();
    });
  }

  /**
   * 🚀 优化：添加随机抖动的重连机制
   * 避免雷群效应（多个客户端同时重连）
   */
  private startReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    // 计算基础延迟（指数退避）
    const baseDelay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    // 🚀 优化：添加±25%的随机抖动
    const jitter = baseDelay * 0.25; // 25%的抖动范围
    const randomJitter = (Math.random() * 2 - 1) * jitter; // -jitter 到 +jitter
    const finalDelay = Math.floor(baseDelay + randomJitter);

    this.logger.log(`重连延迟: ${finalDelay}ms (基础: ${baseDelay}ms, 抖动: ${Math.round(randomJitter)}ms)`, LogLevel.DEBUG);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.tryReconnect();
    }, finalDelay);
  }

  /**
   * 🚀 优化：改进错误处理和日志
   */
  private async tryReconnect(): Promise<void> {
    try {
      const config = this.config.getConfig();
      await this.connect(config.host, config.port);
      this.stopReconnect();
      this.logger.log(`重连成功（第${this.reconnectAttempts}次尝试）`, LogLevel.INFO);
    } catch (error) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.stopReconnect();
        this.logger.log(`重连失败，已达到最大尝试次数（${this.maxReconnectAttempts}）`, LogLevel.ERROR);
        this.logger.log(`最后错误: ${error instanceof Error ? error.message : String(error)}`, LogLevel.ERROR);
      } else {
        this.logger.log(`重连失败（第${this.reconnectAttempts}次尝试），${this.maxReconnectAttempts - this.reconnectAttempts}次剩余`, LogLevel.WARN);
      }
    }
  }

  private stopReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  send(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.writable) {
        reject(new Error('连接未建立'));
        return;
      }

      this.socket.write(data, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  dispose(): void {
    this.stopReconnect();
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.eventEmitter.removeAllListeners();
  }
} 
