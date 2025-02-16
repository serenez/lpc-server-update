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
} 
