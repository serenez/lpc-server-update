# 🎮 LPC服务器连接器

[![Version](https://img.shields.io/badge/version-1.0.5-blue.svg)]()
[![License](https://img.shields.io/badge/license-MIT-green.svg)]()
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)]()

一个专业的 VS Code 扩展，为 LPC 游戏开发者提供完整的服务器连接和管理解决方案。

[安装](#安装) • [特性](#特性) • [使用说明](#使用说明) • [配置](#配置) • [常见问题](#常见问题)

</div>

## 📑 目录

- [⚠️ 使用前注意](#使用前注意)
- [✨ 特性](#特性)
- [🔧 系统要求](#系统要求)
- [📥 安装](#安装)
- [🚀 快速开始](#快速开始)
- [📖 使用说明](#使用说明)
- [⚙️ 配置](#配置)
- [❓ 常见问题](#常见问题)
- [🤝 贡献指南](#贡献指南)
- [📄 许可证](#许可证)

## ⚠️ 使用前注意

### 🌐 使用环境选择

#### 1️⃣ 服务器本地使用
```properties
IP地址设置: localhost 或 127.0.0.1
适用场景: 直接在游戏服务器上开发
优势: 最佳性能和稳定性
```

#### 2️⃣ 远程SSH连接
```properties
工具: VS Code Remote-SSH
IP设置: localhost 或 127.0.0.1
适用场景: 远程开发但需要本地编辑器体验
```

#### 3️⃣ 本地开发环境
> ⚡ **重要**: 必须确保本地与服务器项目文件保持同步！

推荐的同步方案：
- 🔄 **[SFTP](https://marketplace.visualstudio.com/items?itemName=liximomo.sftp)** (推荐)
  - VS Code插件
  - 实时文件同步
  - 简单易用
- 🔁 **[Syncthing](https://syncthing.net/)**
  - 跨平台同步工具
  - 支持双向同步
  - 开源免费

> 💡 **工作原理说明**：
> 
> 本插件通过登录MUD内的巫师账号来执行相关命令。因此，要确保：
> 1. 在服务器本地使用此插件，或
> 2. 保证本地文件与服务器文件同步
> 
> 否则，即使执行UPDATE命令也无法正确编译文件。

### 🛠️ 服务器端准备

1. 在 `logind.c` 中添加客户端验证：

```c
// logind.c - 客户端验证部分

/*
 * 在验证函数中添加以下代码
 * 用于验证客户端的合法性
 */
if (arg != sha1("buyi-SerenezZmuy") && 你的原有判断条件) {
    // 验证失败，断开连接
    write("客户端非法\n");
    destruct(ob);
    return;
}
```

2. 在 `cmds/wiz` 目录下创建 `eval.c`：

```c
// eval.c - 自定义eval命令实现

inherit _CLEAN_UP;

/*
 * eval命令主函数
 * 用于执行LPC代码片段并返回结果
 */
int main(object me, string arg)
{
    object eval_ob;
    string filename, file;

    // 参数检查
    if (!arg) {
        return help(me);
    }

    // 设置临时文件名
    filename = "/debug_eval_file.c";

    // 权限检查
    if (!wizardp(me)) {
        return 0;
    }

    // 清理旧文件
    if (file_size(filename) != -1) {
        rm(filename);
    }
    if (eval_ob = find_object(filename)) {
        destruct(eval_ob);
    }

    // 构建并写入临时文件
    file = "mixed eval(object me) { " + arg + "; }\n";
    write_file(filename, file, 1);

    // 执行并返回结果
    write(sprintf(ESC+"MUY%O║\n", filename->eval(me)));

    return 1;
}

/*
 * 帮助信息函数
 * 显示命令使用说明
 */
int help(object me)
{
    if (!wizardp(me)) {
        return 0;
    }

    write(@HELP
指令格式: eval <lpc code>
指令说明:
    测试专用，直接执行LPC代码片断，如：eval return me
HELP);

    return 1;
}
```

### ⚙️ 客户端配置

在项目根目录创建配置文件：`.vscode/muy-lpc-update.json`

```json
{
  "host": "你的服务器地址",
  "port": 你的服务器端口,
  "username": "你的巫师账号",
  "password": "你的巫师密码",
  "serverKey": "buyi-SerenezZmuy",
  "encoding": "UTF8",
  "loginKey": "你的登录KEY 一般为ZJKEY",
  "compile": {
    "autoCompileOnSave": false,
    "defaultDir": "",
    "timeout": 30000,
    "showDetails": true
  },
  "loginWithEmail": false
}
```

### 🔒 安全注意事项

- 🚫 禁止在公共场合分享配置文件
- 📝 建议将 `muy-lpc-update.json` 添加到 `.gitignore`
- 🔑 定期更改密码和验证密钥
- 🛡️ 确保服务器端口的安全性

### 📝 编码设置

1. 默认使用 `UTF8` 编码
2. 如遇中文乱码，请切换到 `GBK` 编码
3. 编码修改后需要重新连接服务器
4. 确保所有LPC文件使用相同的编码格式

### 📞 联系与支持

- 🆘 遇到问题？联系QQ：279631638
- 🐛 发现Bug？提交 [ISSUES](https://github.com/serenez/lpc-server-update/issues)
- 💡 建议反馈？欢迎在GitHub上交流

## ✨ 特性

### 🔌 服务器连接管理

- 一键连接/断开服务器
- 支持UTF8和GBK编码自动切换
- 智能重连机制，自动处理网络波动
- 实时连接状态监控
- 安全的身份验证机制
- 支持自定义命令发送
- 支持Eval自定义命令执行

### 🛠 文件编译

- 快速编译当前文件
- 支持整个目录批量编译
- 保存时自动编译（可配置）
- 智能路径转换
- 实时编译状态反馈
- 详细的编译信息显示

### ⚙️ 服务器操作

- 自定义命令管理
  * 快速添加/删除自定义命令
  * 命令模板保存
  * 一键执行常用命令
- 自定义Eval命令
  * 支持复杂的Eval操作
  * 结果实时显示
  * JSON格式化输出
- 安全的服务器重启功能
- 实时消息监控和日志记录

### 📊 消息系统

- 分类显示（成功/错误/警告/系统）
- 时间戳显示（可配置格式）
- 自动滚动/锁定功能
- 消息清理
- 自定义消息颜色
- 消息图标显示
- 最大消息数量限制

### 🎯 开发体验

- 直观的图形界面
- 快捷键支持
- 实时状态反馈
- 详细的错误提示
- 配置文件自动初始化
- 编码自动检测

## 🔧 系统要求

- VS Code 1.60.0 或更高版本
- Node.js 14.x 或更高版本
- 支持的操作系统：Windows、macOS、Linux
- 网络连接（用于服务器通信）

## 📥 安装

### 手动安装

1. 下载最新的 `.vsix` 文件
2. 在 VS Code 中按下 `Ctrl+Shift+P`
3. 输入 `Install from VSIX`
4. 选择下载的文件

## 🚀 快速开始

1. 安装插件后，点击左侧活动栏的 LPC 图标
2. 在设置中配置服务器信息：
   - 服务器地址和端口
   - 巫师账号和密码
   - 编码设置（UTF8/GBK）
   - 登录KEY配置
3. 点击"连接游戏服务器"按钮
4. 开始享受便捷的开发体验！

## 📖 使用说明

### 服务器配置

#### 1. 基础配置

在 VS Code 设置中配置以下信息：

- 服务器地址和端口
- 巫师账号和密码
- MUD 项目根目录
- 登录KEY设置

#### 2. 服务器验证

在 `logind.c` 文件中添加验证代码：

```c
// 在验证代码中添加以下判断
if(arg!=sha1("buyi-SerenezZmuy") &&你的原有判断条件条件){
    write("客户端非法\n");
    destruct(ob);
    return;
}
```

#### 3. Eval自定义命令

在cmds/wiz目录下，创建eval.c文件，并添加以下内容：

```c
int main(object me, string arg)
{
    object eval_ob;
    string filename, file;
	
    if (!arg)
        return help(me);

    filename = "/debug_eval_file.c";

    if (!wizardp(me))
        return 0;

    /* clean up first */
    if (file_size(filename) != -1)
        rm(filename);
    if (eval_ob = find_object(filename))
        destruct(eval_ob);

    file = "mixed eval(object me) { " + arg + "; }\n";
    write_file(filename, file, 1);
    write(sprintf(ESC+"MUY%O║\n",filename->eval(me)));

    return 1;
}

int help(object me)
{
    if (!wizardp(me))
        return 0;

    write(@HELP
指令格式: eval <lpc code>
指令说明:
    测试专用，直接执行LPC代码片断，如：eval return me
HELP);

    return 1;
}
```

### 开发工作流

#### 1. 连接服务器

- 使用活动栏图标打开插件面板
- 点击"连接游戏服务器"
- 等待连接成功提示

#### 2. 文件编译

- 单文件编译：打开文件后点击"编译当前文件"
- 目录编译：点击"编译目录"并输入目录路径
- 自动编译：在设置中启用"保存时自动编译"
- 编译结果会实时显示在消息面板

#### 3. 服务器操作

- 自定义命令：
  * 点击"自定义命令"下拉菜单
  * 选择已保存的命令或添加新命令
  * 一键执行常用操作
- Eval命令：
  * 点击"自定义Eval"下拉菜单
  * 执行LPC代码片段
  * 查看格式化的结果输出
- 服务器重启：使用"重启服务器"功能

## ⚙️ 配置

### 基础配置项

| 配置项 | 说明 | 默认值 | 必填 |
|--------|------|--------|------|
| `gameServerCompiler.encoding` | 服务器通信编码 | UTF8 | 否 |
| `gameServerCompiler.host` | 服务器地址 | - | 是 |
| `gameServerCompiler.port` | 服务器端口 | - | 是 |
| `gameServerCompiler.username` | 巫师账号 | - | 是 |
| `gameServerCompiler.password` | 巫师密码 | - | 是 |
| `gameServerCompiler.serverKey` | 服务器验证密钥 | "buyi-SerenezZmuy" | 否 |
| `gameServerCompiler.loginKey` | 登录验证密钥 | "buyi-ZMuy" | 否 |

### 高级配置

#### 消息设置

```json
{
  "gameServerCompiler.messages.maxCount": 1000,
  "gameServerCompiler.messages.timeFormat": "HH:mm:ss",
  "gameServerCompiler.messages.showIcons": true,
  "gameServerCompiler.messages.autoScroll": true,
  "gameServerCompiler.messages.colors": {
    "success": "#4CAF50",
    "error": "#f44336",
    "warning": "#ff9800",
    "info": "#2196F3",
    "system": "#9C27B0"
  }
}
```

#### 编译设置

```json
{
  "gameServerCompiler.compile.defaultDir": "",
  "gameServerCompiler.compile.autoCompileOnSave": false,
  "gameServerCompiler.compile.timeout": 30000,
  "gameServerCompiler.compile.showDetails": true
}
```

#### 连接设置

```json
{
  "gameServerCompiler.connection.maxRetries": 3,
  "gameServerCompiler.connection.retryInterval": 5000,
  "gameServerCompiler.connection.timeout": 10000,
  "gameServerCompiler.connection.heartbeatInterval": 30000
}
```

#### UI设置

```json
{
  "gameServerCompiler.ui.messagesPanelSize": 1,
  "gameServerCompiler.ui.buttonsPanelSize": 2,
  "gameServerCompiler.ui.showButtons": true
}
```

## ❓ 常见问题

### 1. 连接问题

Q: 无法连接到服务器？
A: 请检查：

- 服务器地址和端口是否正确
- 网络连接是否正常
- 防火墙设置是否允许连接
- 验证密钥是否正确配置
- 编码设置是否与服务器匹配

### 2. 编译问题

Q: 文件编译失败？
A: 可能的原因：

- 文件路径不正确
- 代码语法错误
- 依赖文件缺失
- 权限不足
- 编码设置不正确

### 3. 性能问题

Q: 编译大型目录很慢？
A: 建议：

- 使用增量编译
- 避免不必要的全目录编译
- 优化代码结构减少依赖
- 确保使用正确的编码设置
- 适当调整编译超时时间

### 4. 中文显示问题

Q: 中文显示乱码？
A: 解决方案：

- 检查编码设置是否正确
- 在配置中将encoding设置为"GBK"
- 重新连接服务器使配置生效
- 确保文件本身使用正确的编码保存

## 🤝 贡献指南

我们欢迎所有形式的贡献，包括但不限于：

- 提交问题和建议
- 改进文档
- 提交代码修复
- 添加新功能

贡献步骤：

1. Fork 项目
2. 创建特性分支
3. 提交更改
4. 推送到分支
5. 创建 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 📞 联系我们

- 问题反馈：[GitHub Issues](https://github.com/serenez/lpc-server-update/issues)
- 邮箱：279631638@qq.com
- QQ：279631638

---

**特别感谢所有贡献者！**
