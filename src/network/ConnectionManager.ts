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

  private startReconnect(): void {
    if (this.reconnectTimer || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.tryReconnect();
    }, delay);
  }

  private async tryReconnect(): Promise<void> {
    try {
      const config = this.config.getConfig();
      await this.connect(config.host, config.port);
      this.stopReconnect();
    } catch (error) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.stopReconnect();
        this.logger.log('重连失败', LogLevel.ERROR);
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
