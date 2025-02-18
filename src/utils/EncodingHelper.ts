import * as iconv from 'iconv-lite';
import { ValidationError } from '../errors';

export class EncodingHelper {
    static encode(text: string, encoding: string = 'UTF8'): Buffer {
        try {
            if (encoding.toUpperCase() === 'GBK') {
                return iconv.encode(text, 'GBK');
            }
            return Buffer.from(text, 'utf8');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ValidationError(`编码失败: ${errorMessage}`);
        }
    }

    static decode(buffer: Buffer, encoding: string = 'UTF8'): string {
        try {
            if (encoding.toUpperCase() === 'GBK') {
                return iconv.decode(buffer, 'GBK');
            }
            return buffer.toString('utf8');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new ValidationError(`解码失败: ${errorMessage}`);
        }
    }

    static cleanControlChars(text: string): string {
        return text.replace(/\x1b\[[0-9;]*[mK]/g, '');
    }

    static cleanColorCodes(text: string): string {
        return text.replace(/\[[0-9;]*m/g, '');
    }
} 
