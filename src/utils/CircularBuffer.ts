/**
 * 环形缓冲区实现
 * 用于高效存储和检索消息，避免内存无限增长
 */

export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;

  constructor(private capacity: number) {
    if (capacity <= 0) {
      throw new Error('Capacity must be greater than 0');
    }
    this.buffer = new Array(capacity);
  }

  /**
   * 向缓冲区添加元素
   * 如果缓冲区已满，覆盖最旧的元素
   */
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.size === this.capacity) {
      // 缓冲区已满，覆盖最旧的元素
      this.head = (this.head + 1) % this.capacity;
    } else {
      this.size++;
    }
  }

  /**
   * 获取缓冲区中的所有元素（按插入顺序）
   */
  getAll(): T[] {
    const result: T[] = [];
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[(this.head + i) % this.capacity];
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * 获取缓冲区大小
   */
  getSize(): number {
    return this.size;
  }

  /**
   * 检查缓冲区是否为空
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * 检查缓冲区是否已满
   */
  isFull(): boolean {
    return this.size === this.capacity;
  }

  /**
   * 清空缓冲区
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
    // 不需要清空数组，只是重置指针
  }

  /**
   * 获取最旧的元素
   */
  peekHead(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    return this.buffer[this.head];
  }

  /**
   * 获取最新的元素
   */
  peekTail(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const index = (this.tail - 1 + this.capacity) % this.capacity;
    return this.buffer[index];
  }

  /**
   * 移除并返回最旧的元素
   */
  shift(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }

    const item = this.buffer[this.head];
    this.buffer[this.head] = undefined;
    this.head = (this.head + 1) % this.capacity;
    this.size--;

    return item;
  }

  /**
   * 获取缓冲区的容量
   */
  getCapacity(): number {
    return this.capacity;
  }
}
