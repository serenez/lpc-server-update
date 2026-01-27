# LPC-Server-UPDATE 测试文档

## 文档概述

本文档说明LPC-Server-UPDATE VS Code扩展的测试策略、测试框架设置、测试用例编写规范以及CI/CD集成方法。

---

## 目录

- [1. 测试策略](#1-测试策略)
- [2. 测试框架设置](#2-测试框架设置)
- [3. 单元测试](#3-单元测试)
- [4. 集成测试](#4-集成测试)
- [5. VS Code扩展测试](#5-vs-code扩展测试)
- [6. 测试覆盖率](#6-测试覆盖率)
- [7. CI/CD集成](#7-cicd集成)
- [8. Mock和测试数据](#8-mock和测试数据)

---

## 1. 测试策略

### 1.1 测试金字塔

```
        /\
       /  \        E2E Tests (少量)
      /____\
     /      \      Integration Tests (中等)
    /________\
   /          \    Unit Tests (大量)
  /______________\
```

**测试分层原则：**
- **单元测试 (70%)** - 测试单个函数和类的行为
- **集成测试 (20%)** - 测试模块间的交互
- **端到端测试 (10%)** - 测试完整的用户场景

### 1.2 测试类型

| 测试类型 | 覆盖范围 | 执行频率 | 执行时间 |
|---------|---------|---------|---------|
| 单元测试 | 单个函数/类 | 每次代码变更 | 快速（秒级） |
| 集成测试 | 模块间交互 | 每次提交 | 中等（分钟级） |
| E2E测试 | 完整用户流程 | 每日/发布前 | 较慢（十分钟级） |

---

## 2. 测试框架设置

### 2.1 推荐测试框架

**单元测试和集成测试：**
```bash
# 安装Jest
npm install --save-dev jest @types/jest

# 或者安装Mocha
npm install --save-dev mocha chai @types/mocha @types/chai
```

**VS Code扩展测试：**
```bash
# 安装VS Code测试工具
npm install --save-dev @vscode/test-electron
```

**测试覆盖率工具：**
```bash
# 安装nyc（Istanbul）
npm install --save-dev nyc
```

### 2.2 配置文件

**jest.config.js：**
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
}
```

**package.json脚本：**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:integration": "jest --config=jest.integration.config.js",
    "test:e2e": "npm run compile && node ./out/test/runTest.js"
  }
}
```

---

## 3. 单元测试

### 3.1 测试文件组织

```
src/
├── utils/
│   ├── EncodingHelper.ts
│   ├── EncodingHelper.test.ts        # 测试文件与源文件同名
│   ├── PathConverter.ts
│   └── PathConverter.spec.ts         # 使用.spec后缀也可以
└── __tests__/                         # 或者放在__tests__目录
    └── utils/
        └── EncodingHelper.test.ts
```

### 3.2 测试用例示例

**EncodingHelper.test.ts：**
```typescript
import { EncodingHelper } from '../EncodingHelper'

describe('EncodingHelper', () => {
  describe('convertToBuffer', () => {
    it('应该正确转换UTF8字符串', () => {
      const input = '测试文本'
      const result = EncodingHelper.convertToBuffer(input, 'UTF8')
      expect(result).toBeInstanceOf(Buffer)
      expect(result.toString('utf8')).toBe(input)
    })

    it('应该正确转换GBK字符串', () => {
      const input = '测试文本'
      const result = EncodingHelper.convertToBuffer(input, 'GBK')
      expect(result).toBeInstanceOf(Buffer)
    })

    it('应该处理空字符串', () => {
      const result = EncodingHelper.convertToBuffer('', 'UTF8')
      expect(result.length).toBe(0)
    })
  })

  describe('convertToString', () => {
    it('应该从UTF8 Buffer正确解码', () => {
      const input = Buffer.from('测试文本', 'utf8')
      const result = EncodingHelper.convertToString(input, 'UTF8')
      expect(result).toBe('测试文本')
    })
  })
})
```

### 3.3 测试最佳实践

**AAA模式（Arrange-Act-Assert）：**
```typescript
it('应该正确转换路径', () => {
  // Arrange - 准备测试数据
  const inputPath = 'C:\\project\\src\\file.c'
  const rootPath = 'C:\\project'

  // Act - 执行被测试的函数
  const result = PathConverter.convertToMudPath(inputPath, rootPath)

  // Assert - 验证结果
  expect(result).toBe('/src/file')
})
```

**测试命名规范：**
```typescript
// 好的命名 - 清晰描述测试意图
it('当连接成功时，应该触发connected事件')
it('如果配置无效，应该抛出ValidationError')
it('应该支持UTF8和GBK编码转换')

// 不好的命名 - 不清晰
it('test1')
it('测试连接')
```

---

## 4. 集成测试

### 4.1 集成测试场景

**模块间交互测试：**
```typescript
describe('ConfigManager 和 CompileManager 集成', () => {
  it('应该使用配置管理器的配置进行编译', async () => {
    // 创建真实的ConfigManager实例
    const configManager = ConfigManager.getInstance()
    await configManager.loadConfig('test/fixtures/config.json')

    // 创建CompileManager并注入依赖
    const compileManager = new CompileManager(configManager)

    // Mock TcpClient
    const mockTcpClient = {
      isConnected: () => true,
      isLoggedIn: () => true,
      sendUpdateCommand: jest.fn().mockResolvedValue(true)
    }

    // 执行编译
    const result = await compileManager.compileFile('/test/file.c')

    // 验证交互
    expect(mockTcpClient.sendUpdateCommand).toHaveBeenCalledWith('/test/file')
    expect(result).toBe(true)
  })
})
```

### 4.2 网络模块集成测试

```typescript
describe('网络通信集成测试', () => {
  it('应该正确处理完整的连接-发送-接收流程', async () => {
    // 创建测试服务器
    const testServer = createTestServer()

    // 创建ConnectionManager
    const connectionManager = new ConnectionManager()

    // 监听事件
    const dataPromise = new Promise((resolve) => {
      connectionManager.on('data', resolve)
    })

    // 连接并发送
    await connectionManager.connect('localhost', testServer.port)
    await connectionManager.send(Buffer.from('TEST_MESSAGE'))

    // 等待响应
    const response = await dataPromise
    expect(response.toString()).toBe('TEST_MESSAGE_RESPONSE')

    // 清理
    connectionManager.dispose()
    testServer.close()
  })
})
```

---

## 5. VS Code扩展测试

### 5.1 扩展测试设置

**测试运行器：**
```typescript
// test/runTest.ts
import * as path from 'path'
import { runTests } from '@vscode/test-electron'

async function main() {
  try {
    // VS Code测试实例的路径
    const vscodePath = process.env.VSCODE_PATH || undefined

    // 运行测试
    await runTests({
      vscodeExecutablePath: vscodePath,
      extensionDevelopmentPath: path.resolve(__dirname, '../'),
      extensionTestsPath: path.resolve(__dirname, './suite'),
      launchArgs: [
        '--disable-extensions', // 禁用其他扩展
        '--new-window',         // 使用新窗口
      ],
    })
  } catch (err) {
    console.error('测试失败:', err)
    process.exit(1)
  }
}

main()
```

### 5.2 扩展测试用例

**测试扩展激活：**
```typescript
// test/suite/extension.test.ts
import * as assert from 'assert'
import * as vscode from 'vscode'

suite('扩展测试套件', () => {
  vscode.window.showInformationMessage('开始运行扩展测试')

  test('扩展应该被激活', async () => {
    const ext = vscode.extensions.getExtension('BUYI-ZMuy.lpc-server-update')
    assert.notStrictEqual(ext, undefined)

    await ext?.activate()
    assert.strictEqual(ext?.isActive, true)
  })

  test('命令应该被注册', async () => {
    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes('game-server-compiler.connect'))
    assert.ok(commands.includes('game-server-compiler.compileCurrentFile'))
  })
})
```

**UI测试：**
```typescript
test('消息面板应该正确显示', async () => {
  // 打开消息面板
  await vscode.commands.executeCommand('game-server-messages.focus')

  // 获取webview
  const messagesView = vscode.extensions.getExtension('BUYI-ZMuy.lpc-server-update')
    ?.exports.getMessageProvider()

  // 发送测试消息
  messagesView?.addMessage('测试消息', 'info')

  // 验证消息显示（通过webview内容或API）
  const messages = messagesView?.getMessages()
  assert.strictEqual(messages?.length, 1)
  assert.strictEqual(messages?.[0].content, '测试消息')
})
```

---

## 6. 测试覆盖率

### 6.1 覆盖率目标

| 模块 | 目标覆盖率 | 优先级 |
|------|----------|--------|
| 核心业务逻辑（CompileManager, MessageProcessor） | 80%+ | 高 |
| 工具类（EncodingHelper, PathConverter） | 90%+ | 高 |
| 配置管理（ConfigManager） | 85%+ | 中 |
| 网络层（ConnectionManager） | 70%+ | 中 |
| UI层（Provider） | 60%+ | 低 |

### 6.2 生成覆盖率报告

```bash
# 运行测试并生成覆盖率报告
npm run test:coverage

# 生成HTML报告
nyc --reporter=html npm test

# 在浏览器中查看
open coverage/index.html
```

### 6.3 覆盖率配置

```json
{
  "nyc": {
    "include": [
      "src/**/*.ts"
    ],
    "exclude": [
      "src/**/*.d.ts",
      "src/**/__tests__/**",
      "src/test/**"
    ],
    "reporter": [
      "text",
      "html",
      "lcov"
    ],
    "check-coverage": true,
    "lines": 70,
    "functions": 70,
    "branches": 70,
    "statements": 70
  }
}
```

---

## 7. CI/CD集成

### 7.1 GitHub Actions配置

**.github/workflows/test.yml：**
```yaml
name: 测试

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest

    strategy:
      matrix:
        node-version: [14.x, 16.x, 18.x]

    steps:
    - uses: actions/checkout@v3

    - name: 设置Node.js ${{ matrix.node-version }}
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - name: 安装依赖
      run: npm ci

    - name: 运行测试
      run: npm test

    - name: 生成覆盖率报告
      run: npm run test:coverage

    - name: 上传覆盖率到Codecov
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella
```

### 7.2 测试报告

**发布测试结果：**
```yaml
- name: 发布测试结果
  uses: EnricoMi/publish-unit-test-result-action@v2
  if: always()
  with:
    files: |
      test-results/**/*.xml
    check_name: 测试结果
```

### 7.3 自动化测试策略

**持续集成检查清单：**
- [ ] 所有单元测试通过
- [ ] 测试覆盖率达标
- [ ] Lint检查通过
- [ ] TypeScript编译无错误
- [ ] 扩展打包成功

---

## 8. Mock和测试数据

### 8.1 Mock TCP连接

```typescript
// test/mocks/TcpClient.mock.ts
export class MockTcpClient {
  private connected = false
  private loggedIn = false
  private messages: string[] = []

  connect(host: string, port: number): Promise<void> {
    this.connected = true
    return Promise.resolve()
  }

  disconnect(): Promise<void> {
    this.connected = false
    this.loggedIn = false
    return Promise.resolve()
  }

  isConnected(): boolean {
    return this.connected
  }

  isLoggedIn(): boolean {
    return this.loggedIn
  }

  async sendUpdateCommand(path: string): Promise<boolean> {
    this.messages.push(`UPDATE ${path}`)
    // 模拟服务器响应
    await this.delay(100)
    return true
  }

  // 辅助方法
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getSentMessages(): string[] {
    return [...this.messages]
  }
}
```

### 8.2 Mock配置文件

**test/fixtures/config.json：**
```json
{
  "host": "localhost",
  "port": 8888,
  "username": "test_wizard",
  "password": "test_password",
  "serverKey": "test-server-key",
  "loginKey": "test-login-key",
  "encoding": "UTF8",
  "rootPath": "/test/project",
  "compile": {
    "autoCompileOnSave": false,
    "defaultDir": "/cmds",
    "timeout": 30000,
    "showDetails": false
  },
  "connection": {
    "maxRetries": 3,
    "retryInterval": 5000,
    "timeout": 10000
  }
}
```

### 8.3 测试数据生成器

```typescript
// test/utils/testDataGenerator.ts
export class TestDataGenerator {
  static generateConfig(overrides = {}): Config {
    return {
      host: 'localhost',
      port: 8888,
      username: 'test_user',
      password: 'test_pass',
      serverKey: 'key',
      loginKey: 'key',
      encoding: 'UTF8',
      rootPath: '/test',
      compile: {
        autoCompileOnSave: false,
        defaultDir: '/cmds',
        timeout: 30000,
        showDetails: false
      },
      connection: {
        maxRetries: 3,
        retryInterval: 5000,
        timeout: 10000
      },
      ...overrides
    }
  }

  static generateMessage(type: MessageType, content: string): Message {
    return {
      type,
      content,
      timestamp: Date.now(),
      source: 'test'
    }
  }
}
```

---

## 附录

### A. 测试检查清单

**编写测试时检查：**
- [ ] 测试名称清晰描述测试意图
- [ ] 使用AAA模式（Arrange-Act-Assert）
- [ ] 每个测试只验证一个行为
- [ ] 测试之间相互独立
- [ ] 使用Mock隔离外部依赖
- [ ] 包含边界情况测试
- [ ] 测试错误路径

**提交代码前检查：**
- [ ] 所有测试通过
- [ ] 测试覆盖率达标
- [ ] 没有跳过的测试（除非有充分理由）
- [ ] CI/CD流水线通过

### B. 常见问题

**Q: 如何测试异步代码？**
```typescript
// 方法1：使用async/await
it('应该正确处理异步操作', async () => {
  const result = await asyncFunction()
  expect(result).toBe(expected)
})

// 方法2：使用done回调
it('应该正确处理异步操作', (done) => {
  asyncFunction().then(result => {
    expect(result).toBe(expected)
    done()
  })
})
```

**Q: 如何Mock VS Code API？**
```typescript
// 使用vscode-mock或手动mock
jest.mock('vscode', () => ({
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
  },
  commands: {
    registerCommand: jest.fn(),
  },
}))
```

**Q: 如何测试私有方法？**
```typescript
// 不建议直接测试私有方法，而是通过公共接口测试
// 如果必须测试，可以使用类型断言
it('测试私有方法', () => {
  const instance = new MyClass()
  // @ts-ignore - 访问私有方法
  const result = instance.privateMethod()
  expect(result).toBe(expected)
})
```

### C. 参考资源

- [Jest文档](https://jestjs.io/docs/getting-started)
- [VS Code扩展测试](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [Testing Library](https://testing-library.com/)
- [Istanbul覆盖率工具](https://istanbul.js.org/)

---

**文档版本：** 1.0.0
**最后更新：** 2026-01-27
**维护者：** 不一 (BUYI-ZMuy)
