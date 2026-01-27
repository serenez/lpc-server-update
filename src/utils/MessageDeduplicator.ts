/**
 * 消息去重器
 * 避免重复消息被处理和显示
 */

export interface MessageDeduplicatorOptions {
  /**
   * 去重时间窗口（毫秒）
   * 在此时间窗口内的相同消息会被认为是重复的
   */
  timeWindow: number;

  /**
   * 最大缓存消息数量
   */
  maxCacheSize: number;
}

export class MessageDeduplicator {
  private messageCache: Map<string, number>;
  private timeWindow: number;
  private maxCacheSize: number;

  constructor(options: MessageDeduplicatorOptions = { timeWindow: 1000, maxCacheSize: 1000 }) {
    this.messageCache = new Map();
    this.timeWindow = options.timeWindow;
    this.maxCacheSize = options.maxCacheSize;
  }

  /**
   * 检查消息是否重复
   * @param message 消息内容
   * @returns 如果是重复消息返回true，否则返回false
   */
  isDuplicate(message: string): boolean {
    const now = Date.now();
    const lastTime = this.messageCache.get(message);

    if (lastTime === undefined) {
      // 首次看到这条消息
      this.messageCache.set(message, now);
      this.cleanupCache(now);
      return false;
    }

    // 检查是否在时间窗口内
    if (now - lastTime < this.timeWindow) {
      return true; // 是重复消息
    }

    // 超出时间窗口，更新时间戳
    this.messageCache.set(message, now);
    this.cleanupCache(now);
    return false;
  }

  /**
   * 清理过期的缓存项
   */
  private cleanupCache(now: number): void {
    // 如果缓存大小超过限制，清理最旧的项
    if (this.messageCache.size > this.maxCacheSize) {
      const entries = Array.from(this.messageCache.entries());
      // 按时间排序，删除最旧的25%
      entries.sort((a, b) => a[1] - b[1]);
      const toRemove = Math.floor(this.maxCacheSize * 0.25);
      for (let i = 0; i < toRemove; i++) {
        this.messageCache.delete(entries[i][0]);
      }
    }

    // 清理超出时间窗口的项
    for (const [message, time] of this.messageCache.entries()) {
      if (now - time > this.timeWindow * 2) {
        this.messageCache.delete(message);
      }
    }
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.messageCache.clear();
  }

  /**
   * 获取缓存大小
   */
  getCacheSize(): number {
    return this.messageCache.size;
  }
}
