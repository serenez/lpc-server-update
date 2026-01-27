/**
 * MessageWorker管理器
 * 管理Worker线程的生命周期和消息处理
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import { LogManager, LogLevel } from '../log/LogManager';

interface WorkerRequest {
  id: number;
  type: 'decode' | 'clean';
  data?: Buffer;
  text?: string;
  encoding?: string;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}

export class MessageWorkerManager {
  private worker: Worker | null = null;
  private pendingRequests: Map<number, WorkerRequest> = new Map();
  private requestId: number = 0;
  private isInitialized: boolean = false;
  private readonly logger = LogManager.getInstance();

  constructor() {
    this.initialize();
  }

  /**
   * 初始化Worker线程
   */
  private initialize(): void {
    try {
      // 🚀 修复：__dirname 已经指向 dist/workers/，直接拼接文件名即可
      const workerPath = path.join(__dirname, 'messageWorker.js');
      this.worker = new Worker(workerPath, {
        resourceLimits: {
          maxOldGenerationSizeMb: 16 // 限制Worker内存使用
        }
      });

      this.worker.on('message', (response) => {
        this.handleWorkerMessage(response);
      });

      this.worker.on('error', (error) => {
        this.logger.log(`Worker错误: ${error.message}`, LogLevel.ERROR, 'MessageWorkerManager');
        // Worker出错后尝试重新初始化
        this.restart();
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          this.logger.log(`Worker异常退出，代码: ${code}`, LogLevel.WARN, 'MessageWorkerManager');
          this.restart();
        }
      });

      this.isInitialized = true;
      this.logger.log('MessageWorker初始化成功', LogLevel.DEBUG, 'MessageWorkerManager');
    } catch (error) {
      this.logger.log(`Worker初始化失败: ${error}`, LogLevel.ERROR, 'MessageWorkerManager');
      // Worker创建失败，降级到同步处理
      this.isInitialized = false;
    }
  }

  /**
   * 重启Worker
   */
  private restart(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;

    // 清理所有pending请求
    for (const request of this.pendingRequests.values()) {
      request.reject(new Error('Worker重启'));
    }
    this.pendingRequests.clear();

    // 延迟重启
    setTimeout(() => {
      this.initialize();
    }, 1000);
  }

  /**
   * 处理Worker返回的消息
   */
  private handleWorkerMessage(response: any): void {
    const request = this.pendingRequests.get(response.id);
    if (!request) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      request.reject(new Error(response.error));
    } else if (response.result !== undefined) {
      request.resolve(response.result);
    } else {
      request.reject(new Error('Invalid response from worker'));
    }
  }

  /**
   * 异步解码Buffer
   */
  async decodeBuffer(buffer: Buffer, encoding: string): Promise<string> {
    if (!this.isInitialized || !this.worker) {
      // Worker未初始化，降级到同步处理
      return this.decodeBufferSync(buffer, encoding);
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { id, type: 'decode', data: buffer, encoding, resolve, reject });

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker decode timeout'));
        }
      }, 5000); // 5秒超时

      this.worker?.postMessage({ id, type: 'decode', data: buffer, encoding });
    });
  }

  /**
   * 异步清理消息
   */
  async cleanMessage(text: string): Promise<string> {
    if (!this.isInitialized || !this.worker) {
      // Worker未初始化，降级到同步处理
      return this.cleanMessageSync(text);
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pendingRequests.set(id, { id, type: 'clean', text, resolve, reject });

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Worker clean timeout'));
        }
      }, 1000); // 1秒超时

      this.worker?.postMessage({ id, type: 'clean', text });
    });
  }

  /**
   * 同步解码Buffer（降级方案）
   */
  private decodeBufferSync(buffer: Buffer, encoding: string): string {
    try {
      if (encoding.toUpperCase() === 'GBK') {
        const iconv = require('iconv-lite');
        return iconv.decode(buffer, 'GBK');
      }
      return buffer.toString('utf8');
    } catch (error) {
      this.logger.log(`同步解码失败: ${error}`, LogLevel.ERROR, 'MessageWorkerManager');
      return buffer.toString('utf8');
    }
  }

  /**
   * 同步清理消息（降级方案）
   */
  private cleanMessageSync(text: string): string {
    const ANSI_COLOR_CODES = /\x1b\[[0-9;]*[mK]/g;
    const WHITESPACE = /\s+/g;
    const CONTROL_CODES = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;

    return text
      .replace(ANSI_COLOR_CODES, '')
      .replace(CONTROL_CODES, '')
      .replace(WHITESPACE, ' ')
      .trim();
  }

  /**
   * 终止Worker
   */
  dispose(): void {
    if (this.worker) {
      this.worker.postMessage({ type: 'terminate' });
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.pendingRequests.clear();
  }

  /**
   * 检查Worker是否可用
   */
  isAvailable(): boolean {
    return this.isInitialized && this.worker !== null;
  }
}
