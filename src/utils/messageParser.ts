import * as iconv from 'iconv-lite';

export class MessageParser {
    // 清理控制字符
    static cleanControlChars(message: string): string {
        return message.replace(/\[[0-9;]*m/g, '');
    }

    // 解析协议号
    static parseProtocol(message: string): number | null {
        const match = message.match(/^(\d{3})/);
        return match ? parseInt(match[1]) : null;
    }

    // 新增: 将字符串转换为Buffer
    static stringToBuffer(text: string, encoding: string = 'UTF8'): Buffer {
        try {
            if (encoding.toUpperCase() === 'GBK') {
                // 直接编码为GBK
                return Buffer.from(iconv.encode(text, 'GBK'));
            }
            // UTF8编码
            return Buffer.from(text, 'utf8');
        } catch (error) {
            console.error('转换Buffer失败:', error);
            return Buffer.from(text);
        }
    }

    // 新增: 将Buffer转换为字符串
    static bufferToString(buffer: Buffer, encoding: string = 'UTF8'): string {
        try {
            // 确保输入是Buffer类型
            const safeBuffer = Buffer.from(buffer);
            
            if (encoding.toUpperCase() === 'GBK') {
                // 直接使用iconv-lite解码GBK
                const text = iconv.decode(safeBuffer, 'GBK');
                // 转换为UTF8
                return iconv.decode(iconv.encode(text, 'UTF8'), 'UTF8');
            }
            // UTF8直接解码
            return iconv.decode(safeBuffer, 'UTF8');
        } catch (error) {
            console.error('转换字符串失败:', error);
            return buffer.toString();
        }
    }

    // 新增: 合并多个Buffer
    static concatBuffers(buffers: Buffer[]): Buffer {
        return Buffer.concat(buffers.map(buf => Buffer.from(buf)));
    }

    // 新增: 创建空Buffer
    static createEmptyBuffer(): Buffer {
        return Buffer.alloc(0);
    }
} 
