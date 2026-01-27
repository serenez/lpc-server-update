/**
 * 消息处理Worker
 * 在独立线程中处理编码转换和消息清理，避免阻塞主线程
 */

import { parentPort, workerData } from 'worker_threads';
import * as iconv from 'iconv-lite';

interface WorkerMessage {
  type: 'decode' | 'clean' | 'terminate';
  data?: Buffer;
  text?: string;
  encoding?: string;
  id?: number;
}

interface WorkerResponse {
  id: number;
  result?: string;
  error?: string;
}

// 预编译的正则表达式（提升性能）
const ANSI_COLOR_CODES = /\x1b\[[0-9;]*[mK]/g;
const WHITESPACE = /\s+/g;
const CONTROL_CODES = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g;

/**
 * 清理颜色代码和控制字符
 */
function cleanMessage(text: string): string {
  return text
    .replace(ANSI_COLOR_CODES, '') // 移除ANSI颜色代码
    .replace(CONTROL_CODES, '')     // 移除控制字符
    .replace(WHITESPACE, ' ')       // 压缩空白字符
    .trim();
}

/**
 * 解码Buffer为字符串
 */
function decodeBuffer(buffer: Buffer, encoding: string): string {
  try {
    if (encoding.toUpperCase() === 'GBK') {
      return iconv.decode(buffer, 'GBK');
    }
    return iconv.decode(buffer, 'UTF8');
  } catch (error) {
    // 降级到默认解码
    return buffer.toString('utf8');
  }
}

/**
 * 处理Worker消息
 */
if (parentPort) {
  parentPort.on('message', (message: WorkerMessage) => {
    try {
      if (message.type === 'terminate') {
        // 终止Worker
        process.exit(0);
        return;
      }

      if (message.type === 'decode' && message.data && message.encoding && message.id !== undefined) {
        // 解码Buffer
        const result = decodeBuffer(message.data, message.encoding);
        parentPort?.postMessage({
          id: message.id,
          result
        } as WorkerResponse);
        return;
      }

      if (message.type === 'clean' && message.text && message.id !== undefined) {
        // 清理消息
        const result = cleanMessage(message.text);
        parentPort?.postMessage({
          id: message.id,
          result
        } as WorkerResponse);
        return;
      }

      // 未知消息类型
      parentPort?.postMessage({
        id: message.id || 0,
        error: `Unknown message type: ${message.type}`
      } as WorkerResponse);

    } catch (error) {
      parentPort?.postMessage({
        id: message.id || 0,
        error: error instanceof Error ? error.message : String(error)
      } as WorkerResponse);
    }
  });
}

// 导出函数供测试使用
export { cleanMessage, decodeBuffer };
