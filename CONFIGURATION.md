# LPC-Server-UPDATE 配置文档

## 目录

- [项目配置文件](#项目配置文件)
- [VS Code 设置项](#vs-code-设置项)
- [常见配置场景](#常见配置场景)
- [配置验证方法](#配置验证方法)
- [编码设置说明](#编码设置说明)
- [安全注意事项](#安全注意事项)

---

## 项目配置文件

### 文件位置

配置文件位于工作区的 `.vscode/muy-lpc-update.json`。

### 配置结构

```json
{
  "host": "服务器地址",
  "port": 端口号,
  "username": "巫师账号",
  "password": "密码",
  "rootPath": "本地项目根路径",
  "serverKey": "服务器验证密钥",
  "encoding": "字符编码",
  "loginKey": "登录验证密钥",
  "compile": {
    "defaultDir": "默认编译目录",
    "autoCompileOnSave": false,
    "timeout": 30000,
    "showDetails": true
  },
  "connection": {
    "timeout": 10000,
    "maxRetries": 3,
    "retryInterval": 5000,
    "heartbeatInterval": 30000
  },
  "loginWithEmail": false
}
```

### 配置项详解

#### 基本连接配置

| 配置项 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `host` | string | 是 | LPC游戏服务器地址（IP或域名） |
| `port` | number | 是 | 服务器端口号（通常为3000-9999） |
| `username` | string | 是 | 巫师账号名称 |
| `password` | string | 是 | 账号密码（明文存储，请注意安全） |
| `rootPath` | string | 否 | 本地项目根路径，用于路径转换 |

#### 服务器验证配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `serverKey` | string | "buyi-SerenezZmuy" | 服务器通信验证密钥 |
| `loginKey` | string | "buyi-ZMuy" | 登录验证密钥 |

#### 编码配置

| 配置项 | 类型 | 默认值 | 可选值 | 说明 |
|--------|------|--------|--------|------|
| `encoding` | string | "UTF8" | "UTF8", "GBK" | 服务器通信字符编码 |

#### 编译配置 (compile)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `compile.defaultDir` | string | "" | 默认编译目录（相对路径） |
| `compile.autoCompileOnSave` | boolean | false | 保存时自动编译文件 |
| `compile.timeout` | number | 30000 | 编译超时时间（毫秒） |
| `compile.showDetails` | boolean | true | 显示编译详细信息 |

#### 连接配置 (connection)

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `connection.timeout` | number | 10000 | 连接超时时间（毫秒） |
| `connection.maxRetries` | number | 3 | 连接失败最大重试次数 |
| `connection.retryInterval` | number | 5000 | 重连间隔时间（毫秒） |
| `connection.heartbeatInterval` | number | 30000 | 心跳检测间隔（毫秒） |

#### 登录配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `loginWithEmail` | boolean | false | 是否使用邮箱登录 |

---

## VS Code 设置项

所有设置项均以 `gameServerCompiler.` 为前缀，可通过 VS Code 设置界面（settings.json）进行配置。

### 消息显示配置 (messages)

#### `gameServerCompiler.messages.maxCount`

- **类型**: number
- **默认值**: 1000
- **范围**: 100 - 10000
- **说明**: 控制消息面板中保留的最大消息数量，超出限制后旧消息会被自动清理

```json
"gameServerCompiler.messages.maxCount": 1000
```

#### `gameServerCompiler.messages.timeFormat`

- **类型**: string
- **默认值**: "HH:mm:ss"
- **可选值**:
  - `"HH:mm"` - 24小时制 时:分
  - `"HH:mm:ss"` - 24小时制 时:分:秒（默认）
  - `"hh:mm:ss a"` - 12小时制 时:分:秒 上午/下午
  - `"YYYY-MM-DD HH:mm:ss"` - 完整日期时间
- **说明**: 消息时间戳的显示格式

```json
"gameServerCompiler.messages.timeFormat": "HH:mm:ss"
```

#### `gameServerCompiler.messages.showIcons`

- **类型**: boolean
- **默认值**: true
- **说明**: 是否在消息前显示类型图标（成功、错误、警告等）

```json
"gameServerCompiler.messages.showIcons": true
```

#### `gameServerCompiler.messages.autoScroll`

- **类型**: boolean
- **默认值**: true
- **说明**: 收到新消息时是否自动滚动到最新消息

```json
"gameServerCompiler.messages.autoScroll": true
```

#### `gameServerCompiler.messages.colors`

- **类型**: object
- **默认值**:
  ```json
  {
    "success": "#4CAF50",
    "error": "#f44336",
    "warning": "#ff9800",
    "info": "#2196F3",
    "system": "#9C27B0"
  }
  ```
- **说明**: 自定义不同消息类型的显示颜色

```json
"gameServerCompiler.messages.colors": {
  "success": "#4CAF50",
  "error": "#f44336",
  "warning": "#ff9800",
  "info": "#2196F3",
  "system": "#9C27B0"
}
```

### 编译配置 (compile)

#### `gameServerCompiler.compile.autoCompileOnSave`

- **类型**: boolean
- **默认值**: false
- **说明**: 保存文件时是否自动触发编译

```json
"gameServerCompiler.compile.autoCompileOnSave": false
```

### 编译诊断配置 (diagnostics)

#### `gameServerCompiler.diagnostics.messageLanguage`

- **类型**: string
- **默认值**: `"dual"`
- **可选值**:
  - `"dual"` - 中英双语，先显示中文，再保留原始英文
  - `"en"` - 仅显示驱动原始英文提示
  - `"zh"` - 仅显示中文翻译后的提示
- **说明**: 控制编译诊断的显示语言，统一作用于本地 LPCC、远程编译消息、Problems 面板和输出摘要

```json
"gameServerCompiler.diagnostics.messageLanguage": "dual"
```

### 连接配置 (connection)

#### `gameServerCompiler.connection.maxRetries`

- **类型**: number
- **默认值**: 3
- **说明**: 连接失败后的最大重试次数

```json
"gameServerCompiler.connection.maxRetries": 3
```

#### `gameServerCompiler.connection.retryInterval`

- **类型**: number
- **默认值**: 5000
- **说明**: 重连间隔时间（毫秒）

```json
"gameServerCompiler.connection.retryInterval": 5000
```

#### `gameServerCompiler.connection.timeout`

- **类型**: number
- **默认值**: 10000
- **说明**: 连接超时时间（毫秒）

```json
"gameServerCompiler.connection.timeout": 10000
```

### 界面配置 (ui)

#### `gameServerCompiler.ui.messagesPanelSize`

- **类型**: number
- **默认值**: 4
- **范围**: 1 - 5
- **说明**: 服务器监控台面板的初始大小

```json
"gameServerCompiler.ui.messagesPanelSize": 4
```

#### `gameServerCompiler.ui.buttonsPanelSize`

- **类型**: number
- **默认值**: 4
- **范围**: 1 - 5
- **说明**: 指令控制台面板的初始大小

```json
"gameServerCompiler.ui.buttonsPanelSize": 4
```

#### `gameServerCompiler.ui.showButtons`

- **类型**: boolean
- **默认值**: true
- **说明**: 是否显示操作按钮面板

```json
"gameServerCompiler.ui.showButtons": true
```

---

## 常见配置场景

### 场景一：本地开发环境

适用于在同一台电脑上开发并连接到本地的LPC服务器。

```json
{
  "host": "127.0.0.1",
  "port": 4000,
  "username": "admin",
  "password": "your_password",
  "rootPath": "c:\\path\\to\\your\\mudlib",
  "serverKey": "buyi-SerenezZmuy",
  "encoding": "UTF8",
  "loginKey": "buyi-ZMuy",
  "compile": {
    "defaultDir": "/d",
    "autoCompileOnSave": true,
    "timeout": 30000,
    "showDetails": true
  },
  "connection": {
    "timeout": 5000,
    "maxRetries": 5,
    "retryInterval": 2000,
    "heartbeatInterval": 30000
  },
  "loginWithEmail": false
}
```

**VS Code settings.json 配置**:

```json
{
  "gameServerCompiler.compile.autoCompileOnSave": true,
  "gameServerCompiler.messages.showIcons": true,
  "gameServerCompiler.messages.autoScroll": true
}
```

### 场景二：远程SSH开发

适用于通过SSH连接到远程LPC服务器进行开发。

```json
{
  "host": "192.168.1.100",
  "port": 4000,
  "username": "wizard",
  "password": "remote_password",
  "rootPath": "/home/wizard/mudlib",
  "serverKey": "buyi-SerenezZmuy",
  "encoding": "UTF8",
  "loginKey": "buyi-ZMuy",
  "compile": {
    "defaultDir": "/daemon",
    "autoCompileOnSave": false,
    "timeout": 60000,
    "showDetails": true
  },
  "connection": {
    "timeout": 15000,
    "maxRetries": 3,
    "retryInterval": 5000,
    "heartbeatInterval": 60000
  },
  "loginWithEmail": false
}
```

**VS Code settings.json 配置**:

```json
{
  "gameServerCompiler.connection.timeout": 15000,
  "gameServerCompiler.connection.retryInterval": 5000,
  "gameServerCompiler.messages.maxCount": 2000,
  "gameServerCompiler.messages.timeFormat": "YYYY-MM-DD HH:mm:ss"
}
```

### 场景三：团队协作开发

适用于多人团队共享同一个配置模板。

```json
{
  "host": "your-mud-server.com",
  "port": 4000,
  "username": "your_username",
  "password": "your_password",
  "rootPath": "",
  "serverKey": "buyi-SerenezZmuy",
  "encoding": "UTF8",
  "loginKey": "buyi-ZMuy",
  "compile": {
    "defaultDir": "",
    "autoCompileOnSave": false,
    "timeout": 30000,
    "showDetails": true
  },
  "connection": {
    "timeout": 10000,
    "maxRetries": 3,
    "retryInterval": 5000,
    "heartbeatInterval": 30000
  },
  "loginWithEmail": false
}
```

**重要提示**:
- 将 `username` 和 `password` 替换为每个团队成员自己的账号信息
- 建议将配置文件添加到 `.gitignore` 避免密码泄露

---

## 配置验证方法

### 1. 配置文件语法检查

确保 JSON 格式正确，可以使用以下方法：

**使用 VS Code**:
1. 打开 `.vscode/muy-lpc-update.json`
2. 查看 VS Code 是否显示 JSON 语法错误
3. 所有字符串必须使用双引号

**使用在线工具**:
- [JSONLint](https://jsonlint.com/)

### 2. 连接测试

配置完成后，测试连接是否成功：

1. 打开命令面板（Ctrl+Shift+P / Cmd+Shift+P）
2. 输入 "LPC服务器: 连接游戏服务器"
3. 查看消息面板的连接结果

**成功标志**:
- 消息面板显示 "已连接到服务器"
- 服务器监控台显示登录成功消息
- 指令控制台按钮变为可用状态

**失败排查**:
```
常见错误信息：
- "连接超时" → 检查 host 和 port 是否正确
- "认证失败" → 检查 serverKey 和 loginKey
- "登录失败" → 检查 username 和 password
- "编码错误" → 尝试切换 encoding 为 GBK
```

### 3. 编译测试

连接成功后，测试编译功能：

1. 打开一个 LPC 源文件（.c 文件）
2. 右键点击编辑器
3. 选择 "LPC服务器: 编译当前文件"
4. 查看编译结果

**预期结果**:
```
✓ [14:23:45] 开始编译: /feature/example.c
✓ [14:23:46] 编译成功
```

### 4. 配置文件最小模板

如需快速验证，可使用最小配置：

```json
{
  "host": "127.0.0.1",
  "port": 4000,
  "username": "test",
  "password": "test123",
  "serverKey": "buyi-SerenezZmuy",
  "encoding": "UTF8",
  "loginKey": "buyi-ZMuy"
}
```

---

## 编码设置说明

### 编码类型

#### UTF8（推荐）

- **适用场景**:
  - 国际化MUD游戏
  - 支持多语言字符
  - 现代LPC驱动（如MudOS、LDMud）

- **特点**:
  - 支持所有Unicode字符
  - 兼容性好
  - 文件体积相对较小

#### GBK

- **适用场景**:
  - 老版本中文MUD
  - Windows传统环境
  - 特定字符集要求

- **特点**:
  - 中文环境兼容性强
  - 仅支持简体中文
  - 可能导致特殊字符显示异常

### 编码对连接的影响

#### 1. 认证阶段

```json
{
  "encoding": "UTF8"  // 必须与服务器一致
}
```

- 如果编码不匹配，认证信息可能无法正确传递
- 导致 "认证失败" 或 "登录失败"

#### 2. 消息显示

- UTF8: 正常显示所有Unicode字符（emoji、特殊符号等）
- GBK: 可能将多字节字符显示为乱码

#### 3. 文件路径

```json
{
  "rootPath": "c:\\项目\\ Mud游戏",  // 中文路径
  "encoding": "GBK"  // 需使用GBK
}
```

- 包含中文的路径建议使用GBK编码
- 纯英文路径推荐使用UTF8

### 编码切换方法

1. **修改配置文件**:

```json
{
  "encoding": "GBK"  // 从 UTF8 改为 GBK
}
```

2. **保存后重启连接**:
   - 断开当前连接
   - 重新执行连接命令

3. **验证结果**:
   - 查看消息是否正常显示
   - 测试编译功能是否正常

### 常见编码问题

| 问题现象 | 可能原因 | 解决方案 |
|----------|----------|----------|
| 中文显示为乱码 | 编码不匹配 | 切换 encoding 设置 |
| 登录失败 | 认证信息编码错误 | 检查服务器编码设置 |
| 编译报错路径异常 | 文件路径编码问题 | 使用英文路径或GBK编码 |
| 特殊字符显示异常 | UTF8字符在GBK下 | 切换到UTF8编码 |

---

## 安全注意事项

### 密码安全

#### 1. 配置文件访问控制

配置文件包含敏感信息（密码），需要妥善保护：

**Windows**:
```cmd
# 设置文件权限（仅当前用户可访问）
icacls ".vscode/muy-lpc-update.json" /inheritance:r
icacls ".vscode/muy-lpc-update.json" /grant:r %USERNAME%:F
```

**Linux/Mac**:
```bash
# 设置文件权限（仅当前用户可读写）
chmod 600 .vscode/muy-lpc-update.json
```

#### 2. Git 版本控制

**务必将配置文件添加到 `.gitignore`**:

```gitignore
# .gitignore
.vscode/muy-lpc-update.json
```

**验证是否已忽略**:
```bash
git check-ignore -v .vscode/muy-lpc-update.json
```

#### 3. 密码强度建议

- 最少8个字符
- 包含大小写字母、数字、特殊符号
- 定期更换密码
- 不要使用默认密码

### 网络安全

#### 1. 使用加密连接

- 优先使用SSH隧道连接
- 避免在不安全的公共网络连接

**SSH隧道示例**:
```bash
ssh -L 4000:localhost:4000 user@remote-server
```

然后配置文件使用:
```json
{
  "host": "127.0.0.1",
  "port": 4000
}
```

#### 2. 防火墙设置

- 限制服务器端口访问来源IP
- 使用防火墙规则限制访问

**Linux防火墙示例**:
```bash
# 仅允许特定IP访问端口4000
iptables -A INPUT -p tcp -s 192.168.1.100 --dport 4000 -j ACCEPT
iptables -A INPUT -p tcp --dport 4000 -j DROP
```

### 密钥安全

#### 1. serverKey 和 loginKey

这些密钥用于验证通信身份：

- **不要使用默认值**（生产环境）
- 定期更换密钥
- 不同环境使用不同密钥

**自定义密钥示例**:
```json
{
  "serverKey": "your-custom-server-key-2024",
  "loginKey": "your-custom-login-key-2024"
}
```

#### 2. 密钥存储

- 不要在代码中硬编码密钥
- 不要在公开渠道分享密钥
- 使用环境变量管理密钥（高级用法）

**环境变量方式**:
```typescript
// 在扩展代码中读取环境变量
const serverKey = process.env.LPC_SERVER_KEY || "buyi-SerenezZmuy";
```

### 审计和日志

#### 1. 连接日志

定期检查连接日志，发现异常活动：

- 失败的登录尝试
- 异常时间段的连接
- 未知IP地址的访问

#### 2. 密码更换策略

建议定期更换密码：
- 开发环境：每月更换
- 生产环境：每季度更换
- 发生安全事件时立即更换

### 最佳实践清单

- [ ] 配置文件已添加到 .gitignore
- [ ] 使用强密码（8+字符，包含特殊符号）
- [ ] 配置文件权限设置为仅当前用户可访问
- [ ] 生产环境使用自定义 serverKey 和 loginKey
- [ ] 定期更换密码和密钥
- [ ] 使用SSH隧道或VPN连接
- [ ] 限制服务器端口访问来源
- [ ] 定期审查连接日志
- [ ] 不同环境使用不同配置
- [ ] 备份配置文件到安全位置

---

## 故障排查

### 连接问题

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| 连接超时 | host/port错误、网络问题 | 检查服务器地址和端口，测试网络连通性 |
| 认证失败 | serverKey不匹配 | 确认serverKey与服务器配置一致 |
| 登录失败 | 用户名/密码错误 | 验证账号信息，检查账号状态 |
| 编码错误 | encoding设置不当 | 尝试切换UTF8/GBK |

### 编译问题

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| 文件不存在 | 路径错误 | 检查rootPath和文件路径配置 |
| 编译超时 | 文件过大或服务器负载高 | 增加compile.timeout值 |
| 权限拒绝 | 账号权限不足 | 联系管理员提升权限 |

### 配置文件问题

| 问题 | 解决方案 |
|------|----------|
| JSON格式错误 | 使用JSONLint检查语法 |
| 配置不生效 | 重启VS Code或重新加载窗口 |
| 中文乱码 | 调整encoding设置为GBK |

---

## 附录

### 完整配置示例

```json
{
  "host": "mud.example.com",
  "port": 4000,
  "username": "wizard_admin",
  "password": "Secure@Password2024!",
  "rootPath": "c:\\Projects\\MyMud",
  "serverKey": "custom-server-key-2024",
  "encoding": "UTF8",
  "loginKey": "custom-login-key-2024",
  "compile": {
    "defaultDir": "/feature",
    "autoCompileOnSave": true,
    "timeout": 60000,
    "showDetails": true
  },
  "connection": {
    "timeout": 15000,
    "maxRetries": 5,
    "retryInterval": 3000,
    "heartbeatInterval": 45000
  },
  "loginWithEmail": false
}
```

### VS Code settings.json 完整示例

```json
{
  // 消息配置
  "gameServerCompiler.messages.maxCount": 2000,
  "gameServerCompiler.messages.timeFormat": "YYYY-MM-DD HH:mm:ss",
  "gameServerCompiler.messages.showIcons": true,
  "gameServerCompiler.messages.autoScroll": true,
  "gameServerCompiler.messages.colors": {
    "success": "#4CAF50",
    "error": "#f44336",
    "warning": "#ff9800",
    "info": "#2196F3",
    "system": "#9C27B0"
  },

  // 编译配置
  "gameServerCompiler.compile.autoCompileOnSave": true,

  // 连接配置
  "gameServerCompiler.connection.maxRetries": 5,
  "gameServerCompiler.connection.retryInterval": 3000,
  "gameServerCompiler.connection.timeout": 15000,

  // 界面配置
  "gameServerCompiler.ui.messagesPanelSize": 5,
  "gameServerCompiler.ui.buttonsPanelSize": 3,
  "gameServerCompiler.ui.showButtons": true
}
```

### 相关资源

- [VS Code API 文档](https://code.visualstudio.com/api)
- [LPC 编程指南](https://lpmuds.net/safety/)
- [MUD游戏开发教程](https://mudconnect.com/)

### 版本历史

- **v1.1.10** (2024): 增加心跳检测配置
- **v1.1.0** (2024): 新增VS Code设置项
- **v1.0.0** (2023): 初始版本

---

**文档版本**: 1.1.10
**最后更新**: 2024年
**维护者**: 不一 (BUYI-ZMuy)
> 说明（2026-02-25）：编译时会优先自动识别项目根目录（命中 `log/adm/cmds/feature/include/std/inherit` 中至少 3 个目录）。
> `rootPath` 仅作为兜底配置项。
