# 🎮 LPC-Server-UPDATE MUD工具

<div align="center">

[![Version](https://img.shields.io/badge/version-1.4.1-blue.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=BUYI-ZMuy.lpc-server-update)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![QQ](https://img.shields.io/badge/QQ-279631638-red.svg?style=for-the-badge)](https://qm.qq.com/cgi-bin/qm/qr?k=XcJNDH3-8WTdP0snH8g88KbiXyeIcNI5)

面向 LPC / MUD 项目的 VS Code 扩展，主要解决两件事：远程 Update，以及用 `lpcc.exe` 先在本地把当前文件编译一遍并直接看到报错位置。

[🌐 English README](README.en.md) • [📋 版本更新记录](CHANGELOG.md) • [⚙️ 配置文档](CONFIGURATION.md) • [🌏 诊断中文化对照表](COMPILER_DIAGNOSTIC_LOCALIZATION.md)

</div>

---
![0mo98-02eoc.gif](https://imgtolinkx.com/i/3E8eKvZs)
## ⭐ 本地 LPCC 编译报错说明

这是当前插件最重要的功能。  
插件会直接调用当前 mudlib 里的 `lpcc.exe`，编译你现在打开的 `.c` / `.lpc` 文件。编译完以后，错误和警告不会只停留在一段原始文本里，而是会直接出现在编辑器里。

现在实际能做到的是：

- 能识别这类标准报错：`/cmds/wiz/testcmd.c line 30, column 3: ...`
- 错误和警告会同时出现在三个地方：
  - `服务器监控台` 的报错卡片
  - VS Code `Problems`
  - 统一输出栏 `LPC-MUD工具`
- 点一下报错，就能跳到对应文件、行、列
- 如果报错落在函数名、变量名这类位置，插件会尽量把**整个名字**标出来，而不是只标 1 个字符
- 可以自己决定是否显示警告
- 可以切换成只看中文、只看英文，或者中英双语
- 可以开启保存后自动本地编译，而且不会在保存时弹窗打断
- 就算当前焦点在输出栏、Problems 或侧栏，插件也会优先使用你当前还开着的代码文件

所以这套本地编译功能，不只是“打印一段英文报错”。  
它会直接告诉你：**哪一个文件、哪一行、哪一列、是什么问题**，并且可以直接点过去看。

### ⭐ 建议配合优化后的 FluffOS / LPCC 驱动使用

插件能把报错显示得多清楚，前提是驱动先把报错给对。  
插件不会凭空猜出更准确的列号，也不会自己判断“到底是第几个参数错了”；它主要是把驱动已经给出的文件、行、列、源码行和箭头，整理到 VS Code 里给你看。

所以这里要说明白：

- 现在这套插件，已经按**优化版 FluffOS 驱动**的报错格式做过适配
- 最好的使用效果，要配合下方的优化版驱动
- 如果继续用旧驱动，插件也能用，但报错位置可能会偏

配合优化后的驱动后，最直接的区别是：

- 语法错误的行号、列号更稳定
- 参数类型错误更容易指到**出错的那个参数**
- 源码行和 `^` 箭头更容易对得上
- 未声明函数、未定义变量、未使用变量这类问题，位置更容易落对

如果你准备把这个插件当成日常主力的 LPC 编译报错工具，建议直接配套使用优化后的 FluffOS / LPCC 驱动。

### ⬇️ 优化版驱动下载

- [优化版 Windows FluffOS 驱动](http://qn.aimud.cn/driver.exe)
- [优化版 Windows LPCC](http://qn.aimud.cn/lpcc.exe)
- Linux 版本不提供现成二进制，请自行从下方 FluffOS 项目源码编译
- [FluffOS 项目地址](https://github.com/serenez/fluffos_Z)

---

## 当前插件能做什么

- 连接游戏服务器，支持多配置环境切换。
- 远程 Update 当前文件、编译目录、发送自定义命令、执行 Eval、重启服务器。
- 本地调用 `lpcc.exe` 离线编译当前文件，并把错误同步到消息面板、`Problems` 和统一输出栏。
- 把 FluffOS / mudlib 返回的编译错误整理成可点击提示，并直接跳到对应文件、行、列。
- 复制当前文件的 MUD 相对路径。
- 为当前 `.c` 文件生成或刷新 `AUTO DECLARATIONS` 函数声明块。
- 收藏常用文件并快速打开。

> 推荐同时安装 [LPC language-server](https://marketplace.visualstudio.com/items?itemName=jlchmura.lpc)  
> 用于语法高亮、补全、悬停、定义跳转等编辑体验。本插件本身不负责这些 LSP 能力。

---

## 适合的使用方式

### 1. 服务器本机开发

推荐。  
插件直接连接本机 MUD 服务端，远程 Update 与本地文件最一致。

### 2. VS Code Remote-SSH 连到服务器开发

同样推荐。  
代码、配置和驱动都在服务器侧，远程 Update 与本地 LPCC 编译都更稳定。

### 3. 本地开发，项目与服务器分离

可以使用，但需要你自行保证文件同步。  
远程 Update 编译的是服务器上的文件，本地 LPCC 编译的是本地磁盘文件；两边不同步时，结果可能不一致。

---

## 当前界面结构

插件在活动栏提供两个视图：

- `📡 服务器监控台`
- `⚡ 指令控制台`

### 服务器监控台

顶部按钮目前包含：

- `登录KEY`：直接打开 `.vscode/muy-lpc-update.json`
- `UTF8 / GBK`：切换远程连接编码
- `登录:含邮箱 / 不含`：切换登录信息是否附带邮箱
- `原始:开 / 关`：切换是否显示服务器原始消息
- `🔒 / 🔓`：切换自动滚动
- `❌`：清空消息

消息面板会显示：

- 普通服务器消息
- 远程编译状态
- 本地 LPCC 编译诊断
- 可点击的编译错误卡片

### 指令控制台

当前布局分成两组：

#### 本地命令

- `本地LPCC编译`
- `本地LPCC设置`
- `生成函数声明`
- `复制相对路径`
- `常用文件`

#### 远程命令

- `远程Update当前文件`
- `编译目录`
- `自定义命令`
- `自定义Eval`
- `重启服务器`
- `连接游戏服务器`

底部还有：

- `配置环境` 选择器
- `当前配置` 折叠面板

当前配置面板会显示：

- 服务端 Update 配置
- 服务端 mudlib 目录映射路径
- 服务端连接地址
- 当前 LPCC
- 当前 Config
- 保存自动本地编译
- 警告提示
- 诊断语言

---

## 配置存储位置

插件现在有两类配置，存放位置不同。

### 1. 服务端 Update 配置

保存在：

```text
.vscode/muy-lpc-update.json
```

这里负责：

- 多配置环境 `profiles`
- 当前激活环境 `activeProfile`
- 远程连接地址、端口、账号、密码
- `rootPath` 兜底映射路径
- 远程保存自动编译 `compile.autoCompileOnSave`
- 自定义命令 / 自定义 Eval / 常用文件

一个最小示例：

```json
{
  "version": 2,
  "activeProfile": "default",
  "profiles": {
    "default": {
      "name": "本地开发环境",
      "host": "127.0.0.1",
      "port": 8080,
      "username": "wizard",
      "password": "password",
      "rootPath": "C:/mud/duobao",
      "serverKey": "buyi-SerenezZmuy",
      "encoding": "UTF8",
      "loginKey": "buyi-ZMuy",
      "loginWithEmail": false,
      "compile": {
        "defaultDir": "/cmds",
        "autoCompileOnSave": false,
        "timeout": 30000,
        "showDetails": true
      },
      "connection": {
        "timeout": 10000,
        "maxRetries": 3,
        "retryInterval": 5000,
        "heartbeatInterval": 30000
      }
    }
  }
}
```

### 2. VS Code 工作区设置

保存在：

```text
.vscode/settings.json
```

这里负责：

- 本地 LPCC 路径
- 本地编译配置文件路径
- 本地编译超时
- 保存自动本地编译
- 是否显示警告
- 诊断语言
- 消息面板与 UI 行为

常用设置示例：

```json
{
  "gameServerCompiler.compile.autoDeclareFunctionsOnSave": false,
  "gameServerCompiler.localCompile.lpccPath": "duobao/fluffos64/lpcc.exe",
  "gameServerCompiler.localCompile.configPath": "duobao/config.ini",
  "gameServerCompiler.localCompile.autoCompileOnSave": false,
  "gameServerCompiler.localCompile.showWarnings": true,
  "gameServerCompiler.diagnostics.messageLanguage": "dual",
  "gameServerCompiler.ui.autoRevealProblems": "error"
}
```

---

## 关键工作流

## 远程 Update 工作流

1. 在 `指令控制台` 里点击 `连接游戏服务器`
2. 打开目标 `.c` / `.lpc` 文件
3. 点击 `远程Update当前文件`
4. 远程返回的编译结果会进入消息面板与 `LPC-MUD工具` 输出栏

补充说明：

- `compile.autoCompileOnSave` 控制的是远程保存自动编译
- 它依赖远程连接已建立且角色已登录
- 远程编译错误会同步成可点击卡片，并可弹出 `Problems`

## 本地 LPCC 工作流

1. 打开当前 mudlib 下的 `.c` / `.lpc` 文件
2. 点击 `本地LPCC编译`
3. 首次可通过 `本地LPCC设置` 指定当前项目使用的 `lpcc.exe` 与 `config.ini/config.cfg`
4. 编译结果会进入消息面板、`Problems` 与 `LPC-MUD工具`

本地 LPCC 的几个重要规则：

- 只扫描**当前文件所属 mudlib** 内的 `lpcc.exe`、`config.ini`、`config.cfg`
- 手动选择的 LPCC 和 Config 也必须位于**当前 mudlib** 内
- 保存自动本地编译是**静默模式**
  - 只在 LPCC / Config 已明确可用时执行
  - 如果路径失效、没扫到、或者扫到多个候选但你还没手动确认，就会自动跳过
  - 不会在保存时弹窗打断

## 函数声明工作流

- `生成函数声明`：手动刷新当前 `.c` 文件的 `AUTO DECLARATIONS` 块
- `gameServerCompiler.compile.autoDeclareFunctionsOnSave`：保存时自动刷新声明块，默认关闭

当前声明逻辑会：

- 回收散落在文件里的匹配声明
- 统一整理到自动声明块
- 尽量避免把上一行脏文本误吞进签名

## 文件相关命令的“当前文件”判定

当前这些命令都不再强依赖编辑器焦点：

- `远程Update当前文件`
- `本地LPCC编译`
- `复制相对路径`
- `生成函数声明`
- `本地LPCC设置`

如果焦点已经切到输出栏、`Problems`、消息面板或侧栏，插件会优先回退到最近一个仍然可见的代码文件，而不是直接报“只能编译 .c 或 .lpc 文件”。

---

## 编译诊断与输出

### 统一输出栏

常规输出只保留一个：

```text
LPC-MUD工具
```

它会承载：

- 远程编译摘要
- 本地 LPCC 编译摘要
- 复制路径结果
- 函数声明结果
- 其他必要插件日志

### Problems 集成

本地 LPCC 与远程编译诊断都会写入 `Problems`。

相关设置：

- `gameServerCompiler.ui.autoRevealProblems = never`
- `gameServerCompiler.ui.autoRevealProblems = error`
- `gameServerCompiler.ui.autoRevealProblems = errorOrWarning`

### 诊断语言

`gameServerCompiler.diagnostics.messageLanguage` 支持三种模式：

- `dual`：中英双语
- `en`：仅英文
- `zh`：仅中文

它会同时影响：

- 本地 LPCC 编译消息
- 远程编译消息
- 消息面板错误卡片
- `Problems`
- 输出摘要

### 原始服务器消息

`原始:开 / 关` 可以控制是否直接显示服务器原始返回文本。  
这个开关适合协议排查，不建议日常长期打开。

---

## 重要设置项速查

### 远程编译与声明

- `gameServerCompiler.compile.autoCompileOnSave`
  - 保存时自动执行远程 Update
- `gameServerCompiler.compile.autoDeclareFunctionsOnSave`
  - 保存时自动刷新函数声明块

### 本地 LPCC

- `gameServerCompiler.localCompile.lpccPath`
- `gameServerCompiler.localCompile.configPath`
- `gameServerCompiler.localCompile.timeout`
- `gameServerCompiler.localCompile.autoCompileOnSave`
- `gameServerCompiler.localCompile.showWarnings`

### 诊断与 UI

- `gameServerCompiler.diagnostics.messageLanguage`
- `gameServerCompiler.ui.autoRevealProblems`
- `gameServerCompiler.messages.showRawData`
- `gameServerCompiler.messages.autoScroll`
- `gameServerCompiler.messages.maxCount`

完整配置说明请看：[CONFIGURATION.md](CONFIGURATION.md)

---

## 命令一览

当前扩展公开命令包括：

- `连接游戏服务器`
- `远程Update当前文件`
- `本地LPCC编译当前文件`
- `本地LPCC设置`
- `复制当前文件相对路径`
- `生成当前文件函数声明`
- `编译目录`
- `发送自定义命令`
- `重启服务器`
- `显示性能报告`
- `重置性能指标`
- `切换配置环境`

其中部分命令在控制台按钮中可直接点击，部分更适合通过命令面板使用。

---

## 文档

- [✅ 当前运行架构（权威）](CURRENT_RUNTIME.md)
- [🏗️ 架构文档](ARCHITECTURE.md)
- [🔌 API 文档](API.md)
- [💻 开发指南](DEVELOPMENT.md)
- [⚙️ 配置文档](CONFIGURATION.md)
- [🌏 编译诊断中文化](COMPILER_DIAGNOSTIC_LOCALIZATION.md)
- [🧩 模块设计](MODULES.md)
- [🧪 测试文档](TESTING.md)

---

## 开发与验证

```bash
npm install
npm run compile
npm run lint
node --test dist/**/*.test.js
```

---

## 常见问题

### 1. 本地 LPCC 自动编译没有触发

优先检查：

- `gameServerCompiler.localCompile.autoCompileOnSave` 是否开启
- 当前文件是否属于可识别的 mudlib
- 当前 mudlib 内的 `lpcc.exe` 与 `config.ini/config.cfg` 是否已明确可用
- 是否存在多个候选路径但尚未手动确认

### 2. 远程 Update 编译的不是最新本地代码

说明服务器上的文件和本地文件没有同步。  
远程 Update 始终编译服务器侧文件，不会自动上传本地改动。

### 3. 为什么本地编译能报错，但远程没有

本地 LPCC 与远程驱动是两条链路。  
本地编译用于离线快速验证，远程编译反映的是服务器当前代码与运行环境。

### 4. 为什么点了输出栏后再编译，还是能找到当前文件

这是现在的设计行为。  
插件会优先使用最近一个可见的代码文件，而不是严格依赖焦点。

---

## 联系方式

- QQ：279631638
- Issues：[GitHub Issues](https://github.com/serenez/lpc-server-update/issues)

---

## 许可证

[MIT License](LICENSE) © 2026 不一
