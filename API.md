# LPC-Server-UPDATE API 文档

本文档提供了 LPC-Server-UPDATE VS Code 扩展的完整 API 参考。

## 目录

- [服务定位器 (ServiceLocator)](#服务定位器-servicelocator)
- [TCP客户端 (TcpClient)](#tcp客户端-tcpclient)
- [命令管理器 (CommandManager)](#命令管理器-commandmanager)
- [编译管理器 (CompileManager)](#编译管理器-compilemanager)
- [配置管理器 (ConfigManager)](#配置管理器-configmanager)
- [消息处理器 (MessageProcessor)](#消息处理器-messageprocessor)
- [连接管理器 (ConnectionManager)](#连接管理器-connectionmanager)
- [连接状态 (ConnectionState)](#连接状态-connectionstate)
- [日志管理器 (LogManager)](#日志管理器-logmanager)
- [工具类](#工具类)
- [错误类](#错误类)
- [类型定义](#类型定义)

---

## 服务定位器 (ServiceLocator)

服务定位器模式实现，负责管理所有服务实例的注册和获取。

### 类定义

```typescript
class ServiceLocator
```

### 静态方法

#### `initializeInstance(context: vscode.ExtensionContext): void`

初始化服务定位器实例。

**参数：**
- `context` - VS Code 扩展上下文

**异常：**
- 无

**示例：**
```typescript
ServiceLocator.initializeInstance(context);
```

---

#### `getInstance(): ServiceLocator`

获取服务定位器单例实例。

**返回值：**
- `ServiceLocator` - 服务定位器实例

**异常：**
- `Error` - 如果服务定位器未初始化

**示例：**
```typescript
const locator = ServiceLocator.getInstance();
```

---

### 实例方法

#### `getService<K extends keyof ServiceType>(name: K): ServiceType[K]`

获取指定名称的服务实例。

**类型参数：**
- `K` - 服务名称类型

**参数：**
- `name` - 服务名称，可选值：
  - `'tcpClient'` - TcpClient 实例
  - `'configManager'` - ConfigManager 实例
  - `'connectionState'` - ConnectionState 实例
  - `'logManager'` - LogManager 实例
  - `'compileManager'` - CompileManager 实例
  - `'commandManager'` - CommandManager 实例
  - `'messageHandler'` - MessageHandlerImpl 实例
  - `'messageProvider'` - MessageProvider 实例
  - `'buttonProvider'` - ButtonProvider 实例

**返回值：**
- `ServiceType[K]` - 对应的服务实例

**异常：**
- `Error` - 如果服务不存在

**示例：**
```typescript
const tcpClient = locator.getService<TcpClient>('tcpClient');
const configManager = locator.getService<ConfigManager>('configManager');
```

---

#### `dispose(): void`

清理所有服务资源。

**示例：**
```typescript
locator.dispose();
```

---

## TCP客户端 (TcpClient)

负责与服务器的TCP连接、消息收发和协议处理。

### 类定义

```typescript
class TcpClient implements IDisposable
```

### 构造函数

#### `constructor(outputChannel: vscode.OutputChannel, buttonProvider: ButtonProvider, messageProvider: any)`

创建TcpClient实例。

**参数：**
- `outputChannel` - VS Code输出通道，用于显示日志
- `buttonProvider` - 按钮提供器，用于更新按钮状态
- `messageProvider` - 消息提供器，用于显示消息

**示例：**
```typescript
const tcpClient = new TcpClient(outputChannel, buttonProvider, messageProvider);
```

---

### 公共方法

#### `connect(host: string, port: number): Promise<void>`

连接到指定服务器。

**参数：**
- `host` - 服务器主机地址（如 'localhost' 或 '127.0.0.1'）
- `port` - 服务器端口号

**返回值：**
- `Promise<void>` - 连接成功时resolve

**异常：**
- `Error` - 连接超时（默认10秒）
- `Error` - 连接被拒绝（ECONNREFUSED）
- `Error` - 主机不存在（ENOTFOUND）
- `Error` - 其他网络错误

**示例：**
```typescript
try {
    await tcpClient.connect('localhost', 8080);
    console.log('连接成功');
} catch (error) {
    console.error('连接失败:', error.message);
}
```

---

#### `disconnect(): void`

断开与服务器的连接并清理资源。

**状态变化：**
- 设置 `connected` 为 `false`
- 设置 `loggedIn` 为 `false`
- 清空诊断信息
- 销毁socket连接

**示例：**
```typescript
tcpClient.disconnect();
```

---

#### `isConnected(): boolean`

检查是否已连接到服务器。

**返回值：**
- `boolean` - `true` 表示已连接，`false` 表示未连接

**示例：**
```typescript
if (tcpClient.isConnected()) {
    console.log('已连接');
}
```

---

#### `isLoggedIn(): boolean`

检查角色是否已登录。

**返回值：**
- `boolean` - `true` 表示已登录，`false` 表示未登录

**示例：**
```typescript
if (tcpClient.isLoggedIn()) {
    console.log('角色已登录');
}
```

---

#### `isReconnecting(): boolean`

检查是否正在重连。

**返回值：**
- `boolean` - `true` 表示正在重连，`false` 表示未重连

**示例：**
```typescript
if (tcpClient.isReconnecting()) {
    console.log('正在重连中...');
}
```

---

#### `sendUpdateCommand(filePath: string): Promise<void>`

发送文件编译命令到服务器。

**参数：**
- `filePath` - MUD服务器文件路径（如 '/cmds/wiz/goto'）

**前置条件：**
- 必须已连接服务器
- 角色必须已登录

**异常：**
- `Error` - 未连接到服务器
- `Error` - 角色未登录

**示例：**
```typescript
await tcpClient.sendUpdateCommand('/cmds/wiz/goto');
```

---

#### `sendCustomCommand(command: string): Promise<void>`

发送自定义命令到服务器。

**参数：**
- `command` - 自定义命令字符串

**前置条件：**
- 必须已连接服务器
- 角色必须已登录

**异常：**
- `Error` - 未连接到服务器
- `Error` - 角色未登录
- `Error` - 命令执行超时（默认30秒）

**示例：**
```typescript
await tcpClient.sendCustomCommand('look');
await tcpClient.sendCustomCommand('updateall /cmds');
```

---

#### `sendEvalCommand(code: string): Promise<void>`

发送Eval命令执行LPC代码。

**参数：**
- `code` - LPC代码表达式

**前置条件：**
- 必须已连接服务器
- 角色必须已登录

**异常：**
- `Error` - 未连接到服务器
- `Error` - 角色未登录

**示例：**
```typescript
await tcpClient.sendEvalCommand('users()');
await tcpClient.sendEvalCommand('this_player()->query_name()');
```

---

#### `sendRestartCommand(): Promise<void>`

发送服务器重启命令。

**前置条件：**
- 必须已连接服务器
- 角色必须已登录

**异常：**
- `Error` - 未连接到服务器
- `Error` - 角色未登录

**示例：**
```typescript
await tcpClient.sendRestartCommand();
```

---

#### `eval(code: string): Promise<void>`

执行Eval命令（别名方法）。

**参数：**
- `code` - LPC代码

**示例：**
```typescript
await tcpClient.eval('environment(this_object())');
```

---

#### `resetState(): void`

重置客户端状态。

**重置内容：**
- 清空待处理命令状态
- 清空编译错误信息
- 清空诊断信息

**示例：**
```typescript
tcpClient.resetState();
```

---

#### `dispose(): void`

清理TcpClient资源。

**示例：**
```typescript
tcpClient.dispose();
```

---

## 命令管理器 (CommandManager)

负责注册和管理VS Code命令。

### 类定义

```typescript
class CommandManager implements IDisposable
```

### 静态方法

#### `getInstance(serviceLocator: ServiceLocator): CommandManager`

获取CommandManager单例实例。

**参数：**
- `serviceLocator` - 服务定位器实例

**返回值：**
- `CommandManager` - 命令管理器实例

**示例：**
```typescript
const commandManager = CommandManager.getInstance(serviceLocator);
```

---

### 实例方法

#### `registerCommands(context: vscode.ExtensionContext): void`

注册所有VS Code命令。

**注册的命令：**
- `game-server-compiler.connect` - 连接/断开服务器
- `game-server-compiler.compileCurrentFile` - 编译当前文件
- `game-server-compiler.compileDir` - 编译目录
- `game-server-compiler.sendCommand` - 发送自定义命令
- `game-server-compiler.eval` - 执行Eval命令
- `game-server-compiler.restart` - 重启服务器

**参数：**
- `context` - VS Code扩展上下文

**示例：**
```typescript
commandManager.registerCommands(context);
```

---

#### `dispose(): void`

清理命令管理器资源。

**示例：**
```typescript
commandManager.dispose();
```

---

## 编译管理器 (CompileManager)

负责文件和目录的编译操作。

### 类定义

```typescript
class CompileManager implements IDisposable
```

### 静态方法

#### `getInstance(): CompileManager`

获取CompileManager单例实例。

**返回值：**
- `CompileManager` - 编译管理器实例

**示例：**
```typescript
const compileManager = CompileManager.getInstance();
```

---

### 实例方法

#### `isCompilableFile(filePath: string): boolean`

检查文件是否可编译。

**参数：**
- `filePath` - 文件路径

**返回值：**
- `boolean` - `true` 表示可编译，`false` 表示不可编译

**可编译的文件扩展名：**
- `.c` - C语言文件
- `.h` - 头文件
- `.lpc` - LPC语言文件

**示例：**
```typescript
if (compileManager.isCompilableFile('/path/to/file.c')) {
    console.log('可以编译');
}
```

---

#### `convertToMudPath(fullPath: string): string`

将本地文件路径转换为MUD服务器路径。

**参数：**
- `fullPath` - 本地文件完整路径

**返回值：**
- `string` - MUD服务器路径（如 '/cmds/wiz/goto'）

**转换规则：**
1. 计算相对于rootPath的相对路径
2. 统一路径分隔符为 '/'
3. 确保路径以 '/' 开头
4. 移除文件扩展名

**异常：**
- `CompileError` - 路径转换失败

**示例：**
```typescript
const mudPath = compileManager.convertToMudPath('C:\\project\\cmds\\wiz\\goto.c');
// 返回: '/cmds/wiz/goto'
```

---

#### `compileFile(filePath: string): Promise<boolean>`

编译指定文件。

**参数：**
- `filePath` - 本地文件路径

**返回值：**
- `boolean` - `true` 表示编译成功，`false` 表示编译失败

**前置条件：**
- 必须已连接服务器
- 角色必须已登录
- 文件必须是可编译类型

**异常：**
- `CompileError` - 不支持的文件类型
- `CompileError` - 未连接或未登录

**示例：**
```typescript
const success = await compileManager.compileFile('C:\\project\\cmds\\wiz\\goto.c');
if (success) {
    console.log('编译成功');
}
```

---

#### `compileDirectory(dirPath: string): Promise<boolean>`

编译指定目录。

**参数：**
- `dirPath` - MUD服务器目录路径（如 '/cmds'）

**返回值：**
- `boolean` - `true` 表示编译成功，`false` 表示编译失败

**前置条件：**
- 必须已连接服务器
- 角色必须已登录

**超时设置：**
- 使用配置文件中的 `compile.timeout` 值（默认30000ms）

**异常：**
- `CompileError` - 未连接或未登录
- `CompileError` - 编译超时

**示例：**
```typescript
const success = await compileManager.compileDirectory('/cmds');
if (success) {
    console.log('目录编译成功');
}
```

---

#### `dispose(): void`

清理编译管理器资源。

**示例：**
```typescript
compileManager.dispose();
```

---

## 配置管理器 (ConfigManager)

负责配置文件的加载、保存和监听。

### 类定义

```typescript
class ConfigManager
```

### 接口定义

```typescript
interface Config {
    host: string;                    // 服务器主机地址
    port: number;                    // 服务器端口
    username: string;                // 用户名
    password: string;                // 密码
    rootPath: string;                // 工作区根路径
    serverKey: string;               // 服务器密钥
    encoding: 'UTF8' | 'GBK';        // 编码格式
    loginKey: string;                // 登录密钥
    loginWithEmail: boolean;         // 登录时是否包含邮箱
    compile: {
        defaultDir: string;          // 默认编译目录
        autoCompileOnSave: boolean;  // 保存时自动编译
        timeout: number;             // 编译超时时间（毫秒）
        showDetails: boolean;        // 显示详细编译信息
    };
    connection: {
        timeout: number;             // 连接超时时间（毫秒）
        maxRetries: number;          // 最大重试次数
        retryInterval: number;       // 重试间隔（毫秒）
        heartbeatInterval: number;   // 心跳间隔（毫秒）
    };
}
```

### 静态方法

#### `getInstance(): ConfigManager`

获取ConfigManager单例实例。

**返回值：**
- `ConfigManager` - 配置管理器实例

**示例：**
```typescript
const configManager = ConfigManager.getInstance();
```

---

### 实例方法

#### `getConfig(): Config`

获取当前配置。

**返回值：**
- `Config` - 配置对象的副本

**示例：**
```typescript
const config = configManager.getConfig();
console.log(`服务器: ${config.host}:${config.port}`);
```

---

#### `updateConfig(newConfig: Partial<Config>): Promise<void>`

更新配置并保存到文件。

**参数：**
- `newConfig` - 部分配置对象

**副作用：**
- 保存配置到 `.vscode/muy-lpc-update.json`
- 触发 `configChanged` 事件

**示例：**
```typescript
await configManager.updateConfig({
    host: 'localhost',
    port: 8080,
    compile: {
        autoCompileOnSave: true
    }
});
```

---

#### `onConfigChanged(listener: (event: {oldConfig: Config, newConfig: Config}) => void): void`

监听配置变化事件。

**参数：**
- `listener` - 配置变化监听器函数

**事件数据：**
- `oldConfig` - 变化前的配置
- `newConfig` - 变化后的配置

**示例：**
```typescript
configManager.onConfigChanged(({ oldConfig, newConfig }) => {
    if (oldConfig.host !== newConfig.host) {
        console.log(`服务器地址已更改: ${newConfig.host}`);
    }
});
```

---

#### `dispose(): void`

清理配置管理器资源。

**示例：**
```typescript
configManager.dispose();
```

---

## 消息处理器 (MessageProcessor)

负责处理和缓冲服务器消息。

### 类定义

```typescript
class MessageProcessor
```

### 枚举定义

```typescript
enum MessageType {
    SYSTEM = 'SYSTEM',      // 系统消息
    COMPILE = 'COMPILE',    // 编译消息
    GAME = 'GAME',          // 游戏消息
    ERROR = 'ERROR'         // 错误消息
}
```

### 接口定义

```typescript
interface Message {
    type: MessageType;      // 消息类型
    content: string;        // 消息内容
    timestamp: Date;        // 时间戳
}
```

### 实例方法

#### `processMessage(message: string): void`

处理接收到的消息。

**参数：**
- `message` - 原始消息字符串

**处理流程：**
1. 自动识别消息类型
2. 清理消息内容（移除颜色代码等）
3. 添加时间戳
4. 放入缓冲区
5. 调度处理（100ms延迟）

**示例：**
```typescript
messageProcessor.processMessage('编译时段错误：/cmds/wiz/goto.c line 10: syntax error');
```

---

#### `on(event: string, listener: (...args: any[]) => void): void`

注册事件监听器。

**支持的事件：**
- `'message'` - 消息事件

**示例：**
```typescript
messageProcessor.on('message', (message: Message) => {
    console.log(`[${message.type}] ${message.content}`);
});
```

---

#### `dispose(): void`

清理消息处理器资源。

**示例：**
```typescript
messageProcessor.dispose();
```

---

## 连接管理器 (ConnectionManager)

负责TCP连接的建立、维护和重连。

### 类定义

```typescript
class ConnectionManager
```

### 实例方法

#### `connect(host: string, port: number): Promise<void>`

连接到服务器。

**参数：**
- `host` - 服务器地址
- `port` - 服务器端口

**返回值：**
- `Promise<void>` - 连接成功时resolve

**特性：**
- 自动重连机制（最多10次）
- 指数退避重连策略
- 连接超时控制

**异常：**
- `Error` - 连接超时

**示例：**
```typescript
await connectionManager.connect('localhost', 8080);
```

---

#### `send(data: Buffer): Promise<void>`

发送数据到服务器。

**参数：**
- `data` - 要发送的数据缓冲区

**返回值：**
- `Promise<void>` - 发送成功时resolve

**异常：**
- `Error` - 连接未建立

**示例：**
```typescript
const buffer = Buffer.from('hello\n', 'utf8');
await connectionManager.send(buffer);
```

---

#### `on(event: string, listener: (...args: any[]) => void): void`

注册事件监听器。

**支持的事件：**
- `'connected'` - 连接成功
- `'disconnected'` - 连接断开
- `'data'` - 接收数据
- `'error'` - 发生错误

**示例：**
```typescript
connectionManager.on('connected', () => {
    console.log('已连接');
});

connectionManager.on('data', (data: Buffer) => {
    console.log('收到数据:', data.toString());
});
```

---

#### `dispose(): void`

清理连接管理器资源。

**示例：**
```typescript
connectionManager.dispose();
```

---

## 连接状态 (ConnectionState)

管理连接和登录状态。

### 类定义

```typescript
class ConnectionState implements IDisposable
```

### 接口定义

```typescript
interface ConnectionStateData {
    connected: boolean;       // 是否已连接
    loggedIn: boolean;        // 是否已登录
    reconnecting: boolean;    // 是否正在重连
    lastHost: string;         // 最后连接的主机
    lastPort: number;         // 最后连接的端口
    reconnectAttempts: number; // 重连尝试次数
}
```

### 静态方法

#### `getInstance(): ConnectionState`

获取ConnectionState单例实例。

**返回值：**
- `ConnectionState` - 连接状态实例

**示例：**
```typescript
const connectionState = ConnectionState.getInstance();
```

---

### 实例方法

#### `getState(): ConnectionStateData`

获取当前连接状态。

**返回值：**
- `ConnectionStateData` - 状态数据的副本

**示例：**
```typescript
const state = connectionState.getState();
console.log(`连接状态: ${state.connected}, 登录状态: ${state.loggedIn}`);
```

---

#### `updateState(newState: Partial<ConnectionStateData>): Promise<void>`

更新连接状态。

**参数：**
- `newState` - 部分状态数据

**副作用：**
- 更新VS Code命令上下文
- 更新状态栏显示
- 触发 `stateChanged` 事件

**示例：**
```typescript
await connectionState.updateState({
    connected: true,
    loggedIn: false
});
```

---

#### `onStateChanged(listener: (event: { oldState: ConnectionStateData; newState: ConnectionStateData }) => void): void`

监听状态变化事件。

**参数：**
- `listener` - 状态变化监听器

**示例：**
```typescript
connectionState.onStateChanged(({ oldState, newState }) => {
    if (oldState.connected !== newState.connected) {
        console.log(`连接状态已变更: ${newState.connected}`);
    }
});
```

---

#### `dispose(): void`

清理连接状态资源。

**示例：**
```typescript
connectionState.dispose();
```

---

## 日志管理器 (LogManager)

负责日志输出和管理。

### 类定义

```typescript
class LogManager
```

### 枚举定义

```typescript
enum LogLevel {
    DEBUG = 'DEBUG',    // 调试级别
    INFO = 'INFO',      // 信息级别
    WARN = 'WARN',      // 警告级别
    ERROR = 'ERROR'     // 错误级别
}
```

### 静态方法

#### `initialize(outputChannel: vscode.OutputChannel): void`

初始化日志管理器。

**参数：**
- `outputChannel` - VS Code输出通道

**示例：**
```typescript
LogManager.initialize(outputChannel);
```

---

#### `getInstance(): LogManager`

获取LogManager单例实例。

**返回值：**
- `LogManager` - 日志管理器实例

**异常：**
- `Error` - 如果日志管理器未初始化

**示例：**
```typescript
const logManager = LogManager.getInstance();
```

---

### 实例方法

#### `log(message: string, level?: LogLevel, context?: string, showNotification?: boolean): void`

记录日志。

**参数：**
- `message` - 日志消息
- `level` - 日志级别（默认：INFO）
- `context` - 上下文信息（可选）
- `showNotification` - 是否显示通知（默认：false）

**示例：**
```typescript
logManager.log('连接成功', LogLevel.INFO, 'Connection');
logManager.log('调试信息', LogLevel.DEBUG);
logManager.log('错误发生', LogLevel.ERROR, 'Network', true);
```

---

#### `getOutputChannel(): vscode.OutputChannel`

获取输出通道。

**返回值：**
- `vscode.OutputChannel` - VS Code输出通道

**示例：**
```typescript
const channel = logManager.getOutputChannel();
channel.show(true);
```

---

#### `logConnection(message: string): void`

记录连接相关日志。

**参数：**
- `message` - 日志消息

**示例：**
```typescript
logManager.logConnection('已连接到服务器');
```

---

#### `logProtocol(type: 'REQUEST' | 'RESPONSE', protocolId: number, data: any): void`

记录协议相关日志。

**参数：**
- `type` - 请求或响应
- `protocolId` - 协议ID
- `data` - 协议数据

**示例：**
```typescript
logManager.logProtocol('REQUEST', 14, { command: 'look' });
```

---

#### `logGame(message: string): void`

记录游戏相关日志。

**参数：**
- `message` - 日志消息

**示例：**
```typescript
logManager.logGame('你来到了长安城');
```

---

#### `logError(error: Error | string, showNotification?: boolean): void`

记录错误日志。

**参数：**
- `error` - 错误对象或错误消息
- `showNotification` - 是否显示通知（默认：true）

**示例：**
```typescript
logManager.logError(new Error('连接失败'), true);
logManager.logError('文件不存在');
```

---

#### `showAll(): void`

显示输出面板。

**示例：**
```typescript
logManager.showAll();
```

---

#### `dispose(): void`

清理日志管理器资源。

**示例：**
```typescript
logManager.dispose();
```

---

## 工具类

### EncodingHelper

编码转换工具类。

#### 静态方法

##### `encode(text: string, encoding?: string): Buffer`

将文本编码为Buffer。

**参数：**
- `text` - 要编码的文本
- `encoding` - 编码格式（'UTF8' 或 'GBK'，默认：'UTF8'）

**返回值：**
- `Buffer` - 编码后的数据

**异常：**
- `ValidationError` - 编码失败

**示例：**
```typescript
const buffer = EncodingHelper.encode('你好世界', 'UTF8');
const gbkBuffer = EncodingHelper.encode('你好世界', 'GBK');
```

---

##### `decode(buffer: Buffer, encoding?: string): string`

将Buffer解码为文本。

**参数：**
- `buffer` - 要解码的数据
- `encoding` - 编码格式（'UTF8' 或 'GBK'，默认：'UTF8'）

**返回值：**
- `string` - 解码后的文本

**异常：**
- `ValidationError` - 解码失败

**示例：**
```typescript
const text = EncodingHelper.decode(buffer, 'UTF8');
const gbkText = EncodingHelper.decode(buffer, 'GBK');
```

---

##### `cleanControlChars(text: string): string`

清理控制字符。

**参数：**
- `text` - 要清理的文本

**返回值：**
- `string` - 清理后的文本

**示例：**
```typescript
const cleanText = EncodingHelper.cleanControlChars('\x1b[31m红色文本\x1b[0m');
// 返回: '红色文本'
```

---

##### `cleanColorCodes(text: string): string`

清理ANSI颜色代码。

**参数：**
- `text` - 要清理的文本

**返回值：**
- `string` - 清理后的文本

**示例：**
```typescript
const cleanText = EncodingHelper.cleanColorCodes('[31m[1m红色文本[0m');
// 返回: '红色文本'
```

---

### PathConverter

路径转换工具类。

#### 静态方法

##### `toMudPath(fullPath: string, rootPath: string): string`

将本地文件路径转换为MUD路径。

**参数：**
- `fullPath` - 本地文件完整路径
- `rootPath` - 工作区根路径

**返回值：**
- `string` - MUD服务器路径

**异常：**
- `ValidationError` - 路径参数为空或转换失败

**示例：**
```typescript
const mudPath = PathConverter.toMudPath(
    'C:\\project\\cmds\\wiz\\goto.c',
    'C:\\project'
);
// 返回: '/cmds/wiz/goto'
```

---

##### `toLocalPath(mudPath: string, rootPath: string): string`

将MUD路径转换为本地文件路径。

**参数：**
- `mudPath` - MUD服务器路径
- `rootPath` - 工作区根路径

**返回值：**
- `string` - 本地文件完整路径

**异常：**
- `ValidationError` - 路径参数为空或转换失败

**示例：**
```typescript
const localPath = PathConverter.toLocalPath(
    '/cmds/wiz/goto',
    'C:\\project'
);
// 返回: 'C:\\project\\cmds\\wiz\\goto.c'
```

---

##### `isValidPath(filePath: string): boolean`

检查路径是否有效。

**参数：**
- `filePath` - 文件路径

**返回值：**
- `boolean` - `true` 表示有效，`false` 表示无效

**示例：**
```typescript
if (PathConverter.isValidPath('/cmds/wiz/goto.c')) {
    console.log('路径有效');
}
```

---

##### `isCompilableFile(filePath: string): boolean`

检查文件是否可编译。

**参数：**
- `filePath` - 文件路径

**返回值：**
- `boolean` - `true` 表示可编译，`false` 表示不可编译

**支持的扩展名：**
- `.c`
- `.h`
- `.lpc`

**示例：**
```typescript
if (PathConverter.isCompilableFile('/cmds/wiz/goto.c')) {
    console.log('可以编译');
}
```

---

### 🚀 CircularBuffer

环形缓冲区实现，用于高效的内存管理。

**文件位置：** `src/utils/CircularBuffer.ts`

#### 构造函数

##### `constructor(capacity: number)`

创建指定容量的环形缓冲区。

**参数：**
- `capacity` - 缓冲区容量（必须大于0）

**异常：**
- `Error` - 容量小于等于0时抛出

**示例：**
```typescript
const buffer = new CircularBuffer<string>(1000);
```

---

#### 方法

##### `push(item: T): void`

向缓冲区添加元素。如果缓冲区已满，自动覆盖最旧的元素。

**参数：**
- `item` - 要添加的元素

**时间复杂度：** O(1)

**示例：**
```typescript
buffer.push('message 1');
buffer.push('message 2');
```

---

##### `pop(): T | undefined`

从缓冲区移除并返回最旧的元素。

**返回值：**
- `T | undefined` - 最旧的元素，如果缓冲区为空则返回 undefined

**示例：**
```typescript
const oldest = buffer.pop();
if (oldest !== undefined) {
    console.log('移除:', oldest);
}
```

---

##### `peek(): T | undefined`

查看但不移除最旧的元素。

**返回值：**
- `T | undefined` - 最旧的元素，如果缓冲区为空则返回 undefined

**示例：**
```typescript
const oldest = buffer.peek();
console.log('最旧的元素:', oldest);
```

---

##### `getAll(): T[]`

获取缓冲区中的所有元素（按插入顺序）。

**返回值：**
- `T[]` - 所有元素的数组

**注意：** 此操作不会清空缓冲区

**示例：**
```typescript
const messages = buffer.getAll();
messages.forEach(msg => console.log(msg));
```

---

##### `clear(): void`

清空缓冲区。

**示例：**
```typescript
buffer.clear();
```

---

##### `isEmpty(): boolean`

检查缓冲区是否为空。

**返回值：**
- `boolean` - `true` 表示为空

**示例：**
```typescript
if (buffer.isEmpty()) {
    console.log('缓冲区为空');
}
```

---

##### `isFull(): boolean`

检查缓冲区是否已满。

**返回值：**
- `boolean` - `true` 表示已满

**示例：**
```typescript
if (buffer.isFull()) {
    console.log('缓冲区已满，新元素将覆盖最旧的元素');
}
```

---

##### `size(): number`

获取当前缓冲区中的元素数量。

**返回值：**
- `number` - 元素数量

**示例：**
```typescript
console.log(`当前元素数量: ${buffer.size()}`);
```

---

### 🚀 MessageDeduplicator

消息去重器，防止重复消息处理。

**文件位置：** `src/utils/MessageDeduplicator.ts`

#### 构造函数

##### `constructor(options?: MessageDeduplicatorOptions)`

创建消息去重器。

**参数：**
- `options.timeWindow` - 时间窗口（毫秒），默认：1000
- `options.maxCacheSize` - 最大缓存大小，默认：1000

**示例：**
```typescript
const deduplicator = new MessageDeduplicator({
    timeWindow: 1000,    // 1秒时间窗口
    maxCacheSize: 1000   // 最大缓存1000条
});
```

---

#### 方法

##### `isDuplicate(message: string): boolean`

检查消息是否重复。

**参数：**
- `message` - 要检查的消息

**返回值：**
- `boolean` - `true` 表示是重复消息

**示例：**
```typescript
if (deduplicator.isDuplicate(message)) {
    return; // 跳过重复消息
}
processMessage(message);
```

---

##### `clear(): void`

清空缓存。

**示例：**
```typescript
deduplicator.clear();
```

---

### 🚀 PerformanceMonitor

性能监控器，用于跟踪关键操作的性能指标。

**文件位置：** `src/utils/PerformanceMonitor.ts`

#### 方法

##### `getInstance(): PerformanceMonitor`

获取 PerformanceMonitor 单例实例。

**返回值：**
- `PerformanceMonitor` - 单例实例

**示例：**
```typescript
const monitor = PerformanceMonitor.getInstance();
```

---

##### `start(name: string): () => void`

开始计时操作，返回停止函数。

**参数：**
- `name` - 操作名称

**返回值：**
- `() => void` - 停止计时函数

**示例：**
```typescript
const endTimer = monitor.start('databaseQuery');
// ... 执行数据库查询 ...
endTimer();
```

---

##### `record(name: string, duration: number): void`

手动记录操作耗时。

**参数：**
- `name` - 操作名称
- `duration` - 耗时（毫秒）

**示例：**
```typescript
const start = Date.now();
// ... 执行操作 ...
monitor.record('operation', Date.now() - start);
```

---

##### `getMetric(name: string): PerformanceMetric | undefined`

获取指定指标的统计信息。

**参数：**
- `name` - 指标名称

**返回值：**
- `PerformanceMetric | undefined` - 性能指标，如果不存在则返回 undefined

**PerformanceMetric 接口：**
```typescript
interface PerformanceMetric {
    name: string;        // 指标名称
    count: number;       // 调用次数
    totalTime: number;   // 总耗时（毫秒）
    minTime: number;     // 最小耗时（毫秒）
    maxTime: number;     // 最大耗时（毫秒）
    avgTime: number;     // 平均耗时（毫秒）
    lastUpdate: number;  // 最后更新时间
}
```

**示例：**
```typescript
const metric = monitor.getMetric('connect');
if (metric) {
    console.log(`平均连接时间: ${metric.avgTime}ms`);
}
```

---

##### `getAllMetrics(): PerformanceMetric[]`

获取所有性能指标。

**返回值：**
- `PerformanceMetric[]` - 所有指标的数组

**示例：**
```typescript
const metrics = monitor.getAllMetrics();
metrics.forEach(metric => {
    console.log(`${metric.name}: ${metric.avgTime}ms (平均)`);
});
```

---

##### `generateReport(): PerformanceReport`

生成性能报告。

**返回值：**
- `PerformanceReport` - 性能报告对象

**PerformanceReport 接口：**
```typescript
interface PerformanceReport {
    uptime: number;                      // 运行时间（毫秒）
    metrics: PerformanceMetric[];        // 所有指标
    memoryUsage?: NodeJS.MemoryUsage;   // 内存使用情况
    summary: string;                     // 报告摘要
}
```

**示例：**
```typescript
const report = monitor.generateReport();
console.log(`运行时间: ${report.uptime / 1000}秒`);
console.log(report.summary);
```

---

##### `formatReport(report: PerformanceReport): string`

格式化性能报告为可读字符串。

**参数：**
- `report` - 性能报告对象

**返回值：**
- `string` - 格式化的报告字符串

**示例：**
```typescript
const report = monitor.generateReport();
const formatted = monitor.formatReport(report);
console.log(formatted);
```

**输出示例：**
```
╔══════════════════════════════════════════════╗
║          📊 性能监控报告                    ║
╠══════════════════════════════════════════════╣
║ 运行时间: 1234.56秒                          ║
╠══════════════════════════════════════════════╣
║ 📈 性能指标                                  ║
╠══════════════════════════════════════════════╣
║ connect                          10     5.23ms    1.00ms   12.50ms     ║
║ processMessage                1523    0.15ms    0.05ms    2.30ms     ║
╠══════════════════════════════════════════════╣
║ 💾 内存使用                                  ║
╠══════════════════════════════════════════════╣
║ RSS: 45.23MB                                 ║
║ Heap Used: 23.45MB                           ║
╚══════════════════════════════════════════════╝
```

---

##### `checkPerformanceIssues(): string[]`

检查性能问题。

**返回值：**
- `string[]` - 性能问题列表

**检查规则：**
- 平均耗时超过 100ms 的操作
- 最大耗时超过 500ms 的操作
- 调用次数超过 1000 次的操作
- 堆内存使用超过 100MB

**示例：**
```typescript
const issues = monitor.checkPerformanceIssues();
if (issues.length > 0) {
    console.warn('发现性能问题:');
    issues.forEach(issue => console.warn(`  - ${issue}`));
} else {
    console.log('未发现性能问题');
}
```

---

##### `reset(): void`

重置所有性能指标。

**示例：**
```typescript
monitor.reset();
```

---

##### `cleanup(maxAge?: number): void`

清理旧的指标数据。

**参数：**
- `maxAge` - 最大保留时间（毫秒），默认：3600000（1小时）

**示例：**
```typescript
// 清理1小时前的数据
monitor.cleanup(3600000);
```

---

### 🚀 ErrorHandler（增强版）

增强的错误处理器，提供错误分类、自动重试等功能。

**文件位置：** `src/errors/ErrorHandler.ts`

#### 枚举类型

##### `ErrorSeverity`

错误严重程度。

```typescript
enum ErrorSeverity {
    RECOVERABLE = 'recoverable',              // 可恢复的错误
    USER_ACTION_REQUIRED = 'user_action_required',  // 需要用户干预
    FATAL = 'fatal'                           // 致命错误
}
```

##### `ErrorCategory`

错误类别。

```typescript
enum ErrorCategory {
    NETWORK = 'network',        // 网络错误
    CONFIG = 'config',          // 配置错误
    COMPILE = 'compile',        // 编译错误
    AUTH = 'auth',              // 认证错误
    FILESYSTEM = 'filesystem',  // 文件系统错误
    UNKNOWN = 'unknown'         // 未知错误
}
```

---

#### 静态方法

##### `handle(error: Error, context: string): void`

处理错误。

**参数：**
- `error` - 错误对象
- `context` - 错误上下文（用于日志）

**示例：**
```typescript
try {
    await tcpClient.connect(host, port);
} catch (error) {
    ErrorHandler.handle(error, 'TcpClient.connect');
}
```

---

##### `withRetry<T>(operation: () => Promise<T>, context: string, maxRetries?: number, delay?: number): Promise<T>`

带重试的操作执行。

**参数：**
- `operation` - 要执行的异步操作
- `context` - 操作上下文（用于日志）
- `maxRetries` - 最大重试次数，默认：3
- `delay` - 重试延迟（毫秒），默认：1000

**返回值：**
- `Promise<T>` - 操作结果

**异常：**
- 如果所有重试都失败，抛出最后一次的错误

**示例：**
```typescript
const result = await ErrorHandler.withRetry(
    () => tcpClient.connect(host, port),
    '连接服务器',
    3,   // 最多重试3次
    5000 // 延迟5秒
);
```

---

##### `createDiagnostic(file: string, line: number, message: string): vscode.Diagnostic`

创建 VS Code 诊断信息。

**参数：**
- `file` - 文件路径
- `line` - 行号（从1开始）
- `message` - 错误消息

**返回值：**
- `vscode.Diagnostic` - VS Code 诊断对象

**示例：**
```typescript
const diagnostic = ErrorHandler.createDiagnostic(
    '/cmds/wiz/goto.c',
    42,
    '语法错误: 缺少分号'
);
```

---

## 错误类

### BaseError

基础错误类，所有自定义错误的父类。

```typescript
class BaseError extends Error
```

### NetworkError

网络相关错误。

```typescript
class NetworkError extends BaseError
```

**示例：**
```typescript
throw new NetworkError('无法连接到服务器');
```

---

### ConfigError

配置相关错误。

```typescript
class ConfigError extends BaseError
```

**示例：**
```typescript
throw new ConfigError('配置文件不存在');
```

---

### CompileError

编译相关错误。

```typescript
class CompileError extends BaseError
```

**属性：**
- `file?: string` - 错误文件路径
- `line?: number` - 错误行号

**示例：**
```typescript
throw new CompileError('语法错误', '/cmds/wiz/goto.c', 10);
```

---

### AuthenticationError

认证相关错误。

```typescript
class AuthenticationError extends BaseError
```

**示例：**
```typescript
throw new AuthenticationError('密码错误');
```

---

### TimeoutError

超时相关错误。

```typescript
class TimeoutError extends BaseError
```

**示例：**
```typescript
throw new TimeoutError('连接超时');
```

---

### ValidationError

验证相关错误。

```typescript
class ValidationError extends BaseError
```

**示例：**
```typescript
throw new ValidationError('参数无效');
```

---

### CommandError

命令相关错误。

```typescript
class CommandError extends BaseError
```

**示例：**
```typescript
throw new CommandError('命令执行失败');
```

---

### StateError

状态相关错误。

```typescript
class StateError extends BaseError
```

**示例：**
```typescript
throw new StateError('无效的状态转换');
```

---

## 类型定义

### ServiceType

服务类型映射。

```typescript
type ServiceType = {
    'tcpClient': TcpClient;
    'configManager': ConfigManager;
    'connectionState': ConnectionState;
    'logManager': LogManager;
    'compileManager': CompileManager;
    'commandManager': CommandManager;
    'messageHandler': MessageHandlerImpl;
    'messageProvider': MessageProvider;
    'buttonProvider': ButtonProvider;
};
```

### IDisposable

可释放接口。

```typescript
interface IDisposable {
    dispose(): void;
}
```

### Message

消息接口。

```typescript
interface Message {
    type: MessageType;
    content: string;
    timestamp: Date;
}
```

### Config

配置接口。

```typescript
interface Config {
    host: string;
    port: number;
    username: string;
    password: string;
    rootPath: string;
    serverKey: string;
    encoding: 'UTF8' | 'GBK';
    loginKey: string;
    compile: {
        defaultDir: string;
        autoCompileOnSave: boolean;
        timeout: number;
        showDetails: boolean;
    };
    connection: {
        timeout: number;
        maxRetries: number;
        retryInterval: number;
        heartbeatInterval: number;
    };
    loginWithEmail: boolean;
}
```

### ConnectionStateData

连接状态数据接口。

```typescript
interface ConnectionStateData {
    connected: boolean;
    loggedIn: boolean;
    reconnecting: boolean;
    lastHost: string;
    lastPort: number;
    reconnectAttempts: number;
}
```

---

## 使用示例

### 完整的编译流程示例

```typescript
import * as vscode from 'vscode';
import { ServiceLocator } from './ServiceLocator';
import { CompileManager } from './compile/CompileManager';

async function compileCurrentFile() {
    try {
        // 获取服务
        const locator = ServiceLocator.getInstance();
        const tcpClient = locator.getService<TcpClient>('tcpClient');
        const compileManager = CompileManager.getInstance();

        // 检查连接状态
        if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
            vscode.window.showErrorMessage('请先连接服务器并登录');
            return;
        }

        // 获取当前文件
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('没有打开的文件');
            return;
        }

        const filePath = editor.document.uri.fsPath;

        // 检查文件类型
        if (!compileManager.isCompilableFile(filePath)) {
            vscode.window.showErrorMessage('只能编译.c或.lpc文件');
            return;
        }

        // 执行编译
        const success = await compileManager.compileFile(filePath);
        if (success) {
            vscode.window.showInformationMessage('编译成功');
        } else {
            vscode.window.showErrorMessage('编译失败');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`编译错误: ${error.message}`);
    }
}
```

### 自定义命令发送示例

```typescript
async function sendCustomCommand() {
    const locator = ServiceLocator.getInstance();
    const tcpClient = locator.getService<TcpClient>('tcpClient');

    // 检查状态
    if (!tcpClient.isConnected() || !tcpClient.isLoggedIn()) {
        throw new Error('未连接或未登录');
    }

    // 发送命令
    await tcpClient.sendCustomCommand('look');
    await tcpClient.sendCustomCommand('inventory');
}
```

### Eval执行示例

```typescript
async function executeEval() {
    const locator = ServiceLocator.getInstance();
    const tcpClient = locator.getService<TcpClient>('tcpClient');

    // 执行LPC代码
    await tcpClient.sendEvalCommand('users()');
    await tcpClient.sendEvalCommand('this_player()->query_name()');
    await tcpClient.sendEvalCommand('environment(this_object())');
}
```

### 配置监听示例

```typescript
const configManager = ConfigManager.getInstance();

// 监听配置变化
configManager.onConfigChanged(({ oldConfig, newConfig }) => {
    if (oldConfig.encoding !== newConfig.encoding) {
        console.log(`编码已更改: ${newConfig.encoding}`);
    }

    if (oldConfig.compile.autoCompileOnSave !== newConfig.compile.autoCompileOnSave) {
        console.log(`自动编译已${newConfig.compile.autoCompileOnSave ? '开启' : '关闭'}`);
    }
});

// 更新配置
await configManager.updateConfig({
    encoding: 'GBK',
    compile: {
        autoCompileOnSave: true
    }
});
```

### 状态监听示例

```typescript
const connectionState = ConnectionState.getInstance();

// 监听状态变化
connectionState.onStateChanged(({ oldState, newState }) => {
    if (oldState.connected !== newState.connected) {
        if (newState.connected) {
            console.log('已连接到服务器');
        } else {
            console.log('已断开连接');
        }
    }

    if (oldState.loggedIn !== newState.loggedIn) {
        if (newState.loggedIn) {
            console.log('角色已登录');
        } else {
            console.log('角色已登出');
        }
    }
});
```

### 错误处理示例

```typescript
import { NetworkError, CompileError, ValidationError } from './errors';

try {
    await tcpClient.connect('localhost', 8080);
} catch (error) {
    if (error instanceof NetworkError) {
        console.error('网络错误:', error.message);
    } else if (error instanceof CompileError) {
        console.error('编译错误:', error.message);
        console.error('文件:', error.file);
        console.error('行号:', error.line);
    } else if (error instanceof ValidationError) {
        console.error('验证错误:', error.message);
    } else {
        console.error('未知错误:', error.message);
    }
}
```

---

## 注意事项

1. **单例模式**：大部分管理器类使用单例模式，需要先调用 `getInstance()` 获取实例。

2. **初始化顺序**：
   - 首先初始化 `ServiceLocator`
   - 然后通过服务定位器获取其他服务

3. **状态检查**：在发送命令前，务必检查连接和登录状态。

4. **资源清理**：在扩展停用时，调用各管理器的 `dispose()` 方法释放资源。

5. **错误处理**：所有异步操作都应进行适当的错误处理。

6. **编码问题**：服务器支持UTF8和GBK两种编码，确保配置正确。

7. **路径转换**：本地文件路径和MUD路径的转换需要基于正确的rootPath。

---

## 版本历史

- **v1.0.0** - 初始版本
- **v1.1.0** - 添加连接管理器和状态管理器
- **v1.2.0** - 改进错误处理和日志系统
- **v1.3.0** - 添加消息处理器和缓冲机制

---

## 许可证

MIT License
