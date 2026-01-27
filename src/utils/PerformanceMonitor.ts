/**
 * 性能监控器
 * 用于监控关键操作的性能指标
 */

import { LogManager, LogLevel } from '../log/LogManager';

export interface PerformanceMetric {
  name: string;
  count: number;
  totalTime: number; // 总耗时（毫秒）
  minTime: number;   // 最小耗时（毫秒）
  maxTime: number;   // 最大耗时（毫秒）
  avgTime: number;  // 平均耗时（毫秒）
  lastUpdate: number;
}

export interface PerformanceReport {
  uptime: number; // 运行时间（毫秒）
  metrics: PerformanceMetric[];
  memoryUsage?: NodeJS.MemoryUsage;
  summary: string;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor | null = null;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private startTime: number = Date.now();
  private logger = LogManager.getInstance();

  private constructor() {
    // 私有构造函数
  }

  static getInstance(): PerformanceMonitor {
    if (PerformanceMonitor.instance === null) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  /**
   * 记录操作开始
   */
  start(name: string): () => void {
    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.record(name, duration);
    };
  }

  /**
   * 记录操作耗时
   */
  record(name: string, duration: number): void {
    let metric = this.metrics.get(name);

    if (!metric) {
      metric = {
        name,
        count: 0,
        totalTime: 0,
        minTime: duration,
        maxTime: duration,
        avgTime: duration,
        lastUpdate: Date.now()
      };
      this.metrics.set(name, metric);
    }

    metric.count++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
    metric.avgTime = metric.totalTime / metric.count;
    metric.lastUpdate = Date.now();
  }

  /**
   * 获取指定指标的统计信息
   */
  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.get(name);
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * 生成性能报告
   */
  generateReport(): PerformanceReport {
    const now = Date.now();
    const uptime = now - this.startTime;
    const metrics = this.getAllMetrics();
    const memoryUsage = process.memoryUsage();

    // 生成摘要
    const slowest = metrics.sort((a, b) => b.avgTime - a.avgTime)[0];
    const mostFrequent = metrics.sort((a, b) => b.count - a.count)[0];

    let summary = `性能报告 (运行时间: ${(uptime / 1000).toFixed(2)}秒)\n`;
    summary += `最慢操作: ${slowest.name} (平均${slowest.avgTime.toFixed(2)}ms)\n`;
    summary += `最频繁操作: ${mostFrequent.name} (${mostFrequent.count}次)\n`;

    return {
      uptime,
      metrics,
      memoryUsage,
      summary
    };
  }

  /**
   * 重置所有指标
   */
  reset(): void {
    this.metrics.clear();
    this.startTime = Date.now();
    this.logger.log('性能监控指标已重置', LogLevel.INFO, 'PerformanceMonitor');
  }

  /**
   * 格式化性能报告为可读字符串
   */
  formatReport(report: PerformanceReport): string {
    let output = '╔══════════════════════════════════════════════╗\n';
    output += '║          📊 性能监控报告                    ║\n';
    output += '╠══════════════════════════════════════════════╣\n';
    output += `║ 运行时间: ${(report.uptime / 1000).toFixed(2)}秒                       ║\n`;
    output += '╠══════════════════════════════════════════════╣\n';
    output += '║ 📈 性能指标                                          ║\n';
    output += '╠══════════════════════════════════════════════╣\n';

    for (const metric of report.metrics) {
      const name = metric.name.padEnd(30);
      const count = metric.count.toString().padStart(8);
      const avg = metric.avgTime.toFixed(2).padStart(8);
      const min = metric.minTime.toFixed(2).padStart(8);
      const max = metric.maxTime.toFixed(2).padStart(8);

      output += `║ ${name} ${count} ${avg}ms ${min}ms ${max}ms      ║\n`;
    }

    if (report.memoryUsage) {
      output += '╠══════════════════════════════════════════════╣\n';
      output += '║ 💾 内存使用                                          ║\n';
      output += '╠══════════════════════════════════════════════╣\n';
      output += `║ RSS: ${(report.memoryUsage.rss / 1024 / 1024).toFixed(2)}MB                     ║\n`;
      output += `║ Heap Total: ${(report.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB             ║\n`;
      output += `║ Heap Used: ${(report.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB              ║\n`;
      output += `║ External: ${(report.memoryUsage.external / 1024 / 1024).toFixed(2)}MB                ║\n`;
    }

    output += '╠══════════════════════════════════════════════╣\n';
    output += '║ 📋 摘要                                             ║\n';
    output += '╠══════════════════════════════════════════════╣\n';
    output += `║ ${report.summary.split('\n').join('\n║ ').padEnd(54)}     ║\n`;
    output += '╚══════════════════════════════════════════════╝\n';

    return output;
  }

  /**
   * 获取性能摘要
   */
  getSummary(): string {
    const report = this.generateReport();
    return report.summary;
  }

  /**
   * 检查是否有性能问题
   */
  checkPerformanceIssues(): string[] {
    const issues: string[] = [];
    const metrics = this.getAllMetrics();

    for (const metric of metrics) {
      // 检查平均耗时超过100ms的操作
      if (metric.avgTime > 100) {
        issues.push(`⚠️ ${metric.name} 平均耗时 ${metric.avgTime.toFixed(2)}ms 超过100ms`);
      }

      // 检查最大耗时超过500ms的操作
      if (metric.maxTime > 500) {
        issues.push(`🔴 ${metric.name} 最大耗时 ${metric.maxTime.toFixed(2)}ms 超过500ms`);
      }

      // 检查操作次数超过1000次
      if (metric.count > 1000) {
        issues.push(`📊 ${metric.name} 调用次数 ${metric.count} 次，可能需要优化`);
      }
    }

    // 检查内存使用
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    if (heapUsedMB > 100) {
      issues.push(`💾 堆内存使用 ${heapUsedMB.toFixed(2)}MB 超过100MB`);
    }

    return issues;
  }

  /**
   * 清理旧的指标数据
   */
  cleanup(maxAge: number = 3600000): void {
    const now = Date.now();
    for (const [name, metric] of this.metrics.entries()) {
      if (now - metric.lastUpdate > maxAge) {
        this.metrics.delete(name);
      }
    }
  }
}
