# 🎮 LPC服务器连接器

<div align="center">

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=BUYI-ZMuy.lpc-server-update)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![QQ](https://img.shields.io/badge/QQ-279631638-red.svg?style=for-the-badge)](https://qm.qq.com/cgi-bin/qm/qr?k=XcJNDH3-8WTdP0snH8g88KbiXyeIcNI5)

一个专业的 VS Code 扩展，为 LPC 游戏开发者提供完整的服务器连接和管理解决方案。

![演示](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHhrc3pzMzlqbGUyaW44cHNyb3Nra3R5czltMng0dDc2Z25xcm5jcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/fkWveGpBG8jT6mlvjF/giphy.gif)

[📋 查看版本更新记录](CHANGELOG.md) • 🎮 **最新版本：1.4.0 - 本地 LPCC 工作流与工具面板收敛**

</div>

---

推荐LPC语法检查，语法高亮，函数提示等功能插件：[LPC language-server](https://marketplace.visualstudio.com/items?itemName=jlchmura.lpc)

服务端 Update 配置文件位于：`项目根目录/.vscode/muy-lpc-update.json`

本地 LPCC 的 `lpcc.exe`、`config.ini/config.cfg`、警告提示、保存自动本地编译、诊断语言等项目级设置，保存于当前工作区的 VS Code 设置中（通常是 `.vscode/settings.json`）。

如该插件配置文件不会配置可咨询我。 QQ 279631638

该插件已经实现 代码补全、诊断、悬停提示、代码导航、跳转、预览、定义、代码大纲、代码导航、构建任务等功能。且我已贡献该插件中文化实现，可直接使用。

搭配此插件可实现更好的编码体验。

---

## ⚠️ 使用前注意

### 🌐 使用环境选择

#### 1️⃣ 与游戏服务器在同一台设备 推荐！⭐️⭐️⭐️⭐️⭐️
<pre>
<code class="properties">IP地址设置: localhost 或 127.0.0.1
适用场景: 直接在游戏服务器上开发
优势: 最佳性能和稳定性</code>
</pre>

#### 2️⃣ 与游戏服务器不在同一台设备，但是利用vscode远程SSH连接游戏服务器 推荐⭐️⭐️⭐️⭐️⭐️！ 
<pre>
<code class="properties">工具: VS Code Remote-SSH
IP设置: localhost 或 127.0.0.1
适用场景: 远程开发但需要本地编辑器体验.

RemoteSSH 免密登录WindowsServer服务器使用教程：
  待更新 如需要可咨询作者 QQ 279631638</code>
</pre>

#### 3️⃣ 本地开发环境，与游戏服务器不在同一台设备
> ⚡ **重要**: 必须确保本地与服务器项目文件保持同步！
此方法依赖同步速度，太慢的同步速度会因为本地文件修改但是未上传至服务器，导致编译的还是旧文件。

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

---

## 📚 文档

深入了解项目的技术细节和开发指南：

| 文档 | 描述 |
|------|------|
| [✅ 当前运行架构（权威）](CURRENT_RUNTIME.md) | 以当前代码为准的主链路与路径转换规则 |
| [🏗️ 架构文档](ARCHITECTURE.md) | 项目整体架构设计和技术栈说明 |
| [🔌 API文档](API.md) | 完整的API接口文档和使用说明 |
| [💻 开发指南](DEVELOPMENT.md) | 开发环境搭建、调试和贡献指南 |
| [⚙️ 配置文档](CONFIGURATION.md) | 详细的配置选项和参数说明 |
| [🌏 编译诊断中文化](COMPILER_DIAGNOSTIC_LOCALIZATION.md) | 驱动英文诊断与插件中文提示的完整对照表 |
| [🧩 模块设计](MODULES.md) | 各功能模块的详细设计文档 |
| [🧪 测试文档](TESTING.md) | 测试策略和测试用例说明 |

---

## 🚀 快速开始

### 1️⃣ 安装
1. 打开 VS Code
2. 按下 `Ctrl+P`
3. 输入 `ext install BUYI-ZMuy.lpc-server-update`

### 2️⃣ 配置

#### 新版本格式（V2）- 多配置环境支持

在 `.vscode/muy-lpc-update.json` 中配置：

<pre>
<code class="json">{
  "version": 2,
  "activeProfile": "default",
  "profiles": {
    "default": {
      "name": "本地开发环境",
      "host": "服务器地址",
      "port": 端口号,
      "username": "巫师账号",
      "password": "密码",
      "rootPath": "项目根目录",
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
    },
    "remote": {
      "name": "远程测试服务器",
      "host": "192.168.1.100",
      ...
    }
  }
}</code>
</pre>

#### 多配置环境管理功能

- ⚙️ **配置环境选择器**：在UI中快速切换不同的服务器配置
- ➕ **添加新配置**：支持添加多个配置环境（本地、测试、生产等）
- 🔄 **一键切换**：点击"切换"按钮即可切换配置，自动断开当前连接
- 📝 **自定义配置名称**：可给每个配置设置易识别的名称
- 🔄 **自动迁移**：旧版本配置会自动迁移到新格式
- 🧭 **自动识别项目根目录**：优先按 `log/adm/cmds/feature/include/std/inherit` 目录特征识别根目录（命中 >=3）
- ℹ️ **rootPath 兜底**：`rootPath` 仅作为自动识别失败时的备用路径
- ✍️ **保存自动生成声明**：`gameServerCompiler.compile.autoDeclareFunctionsOnSave` 属于 VS Code 设置项，默认关闭，需要时可在设置中开启；也可随时点击面板按钮手动刷新当前文件的声明块

<details>
<summary><b>📖 旧版本格式（V1）自动迁移</b></summary>

如果是旧版本配置，插件会自动迁移到新格式，无需手动修改。

旧格式：
```json
{
  "host": "localhost",
  "port": 8080,
  ...
}
```

自动迁移后：
```json
{
  "version": 2,
  "activeProfile": "default",
  "profiles": {
    "default": {
      "name": "默认配置",
      "host": "localhost",
      "port": 8080,
      ...
    }
  }
}
```
</details>

### 3️⃣ 开始使用
1. 点击左侧活动栏的 LPC 图标
2. 点击 "连接游戏服务器"
3. 开始编码！

### 🔥 最新改进（1.4.0）

- 🏠 **本地 LPCC 工作流完善**：新增 `gameServerCompiler.localCompile.autoCompileOnSave`，可在保存 `.c/.lpc` 时自动做本地离线编译；该流程为静默模式，仅在 LPCC 和配置文件已明确可用时才执行，不会在保存时弹窗打断
- ⚙️ **本地 LPCC 设置收口**：`本地LPCC设置` 统一管理当前项目的 `lpcc.exe`、`config.ini/config.cfg`、保存自动本地编译、警告提示和诊断语言，并在底部“当前配置”里实时显示
- 🌏 **编译诊断支持中英双语**：新增 `gameServerCompiler.diagnostics.messageLanguage`，默认 `dual`；可切换为仅英文或仅中文，统一作用于本地 LPCC、远程编译消息、Problems 与输出摘要
- 🎯 **编译错误只保留必要提示**：本地与远程编译输出统一收敛到 `LPC-MUD工具`，编译诊断仍保留精准定位，但移除了多余的过程噪音；复制相对路径、生成函数声明等非编译操作只显示结果
- 🧭 **当前文件不再依赖焦点**：点击输出栏、Problems 或侧栏后，再执行“远程Update当前文件”“本地LPCC编译”“复制相对路径”“生成函数声明”等命令，会优先使用当前可见的代码文件，而不是因为焦点丢失误判
- 🧩 **工具面板重排**：本地命令与远程命令分组展示，当前配置区域改为折叠展开，`服务端工作目录` 文案也明确改为 `服务端mudlib目录映射路径`

---

## 🛠️ 功能特性

### ⚙️ 多配置环境管理 ⭐ NEW
- **多服务器配置**：支持同时配置多个服务器环境（本地、测试、生产等）
- **快速切换**：一键切换不同配置，无需手动修改配置文件
- **配置隔离**：不同环境的配置完全独立，互不干扰
- **自动迁移**：旧版本配置自动升级到新格式
- **智能断连**：切换配置时自动断开当前连接，避免冲突

### 🔌 服务器连接
- 一键连接/断开服务器
- 支持 UTF8/GBK 编码
- 智能重连机制
- 实时状态监控

### 📝 代码编译
- 快速远程 Update 当前文件
- 支持本地 LPCC 编译当前文件
- 支持通过“本地LPCC设置”统一配置当前项目使用的 `lpcc.exe`、`config.ini/config.cfg`、保存自动本地编译、警告提示开关与诊断提示语言
- 支持整个目录编译
- 支持一键手动生成当前文件函数声明
- 可选开启保存时自动生成函数声明（默认关闭）
- 可选开启保存时自动本地 LPCC 编译（默认关闭，静默执行）
- 编译错误统一收敛为单条摘要
- 本地 LPCC 报错会同步进入 Problems，并支持跳转到具体文件/行/列
- 错误实时提示与 Problems 定位
- 编译诊断支持英文 / 中文 / 中英双语三种显示模式
- 点击错误直接跳转到具体文件/行/列
- 文件相关命令会优先使用当前可见代码文件，不依赖输出栏或侧栏焦点

### 💻 命令管理
- 自定义命令快捷执行
- 支持 Eval 命令
- 服务器重启管理
- 实时执行反馈
- 复制当前文件 MUD 相对路径

### 📊 消息系统
- 分类消息显示
- 自动滚动/锁定
- 支持消息清理
- 自定义消息样式
- 原始数据开关（服务器发来什么就显示什么）
- 编译过程仅保留必要提示与最终诊断，减少噪音卡片
- 常规输出统一收敛到 `LPC-MUD工具` 输出栏

### 🧭 编译诊断配置

- `gameServerCompiler.ui.autoRevealProblems`
  - `never`：不自动弹出 Problems
  - `error`：仅编译错误时自动弹出 Problems
  - `errorOrWarning`：编译错误或警告时都自动弹出 Problems

> 说明：插件会优先解析 FluffOS 原始诊断头 `/file line N[, column M]: [Warning: ]message`。  
> 如果 mudlib 额外包了一层中文错误块，插件也会兼容提取出准确的文件、行、列和错误消息，并收敛为一条可点击卡片。

---

## 🔒 安全注意事项

- 🚫 禁止在公共场合分享配置文件
- 📝 建议将 `muy-lpc-update.json` 添加到 `.gitignore`
- 🔑 定期更改密码和验证密钥
- 🛡️ 确保服务器端口的安全性

---

## 🤝 贡献指南

欢迎贡献代码、报告问题或提出改进建议！

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

详细的开发指南请参考：[💻 开发指南](DEVELOPMENT.md)

---

## ❓ 常见问题

<details>
<summary><b>⚙️ 多配置环境管理</b></summary>

**Q: 如何添加新的服务器配置？**
A: 在配置环境选择器中选择"➕ 添加新配置..."，输入配置名称即可

**Q: 如何切换配置？**
A: 在下拉菜单中选择配置，然后点击"切换"按钮

**Q: 切换配置会影响现有连接吗？**
A: 会。如果已连接服务器，切换配置前会自动断开连接

**Q: 旧版本的配置怎么办？**
A: 插件会自动迁移到新格式，无需手动修改
</details>

<details>
<summary><b>🔌 连接失败</b></summary>

1. 检查服务器地址和端口
2. 确认网络连接
3. 验证登录信息
4. 确认当前使用的配置环境是否正确
</details>

<details>
<summary><b>⚠️ 编译错误</b></summary>

1. 检查文件路径
2. 查看错误信息
3. 确认编码设置
4. 确认文件位于项目目录中（插件会自动识别项目根目录）
5. 若自动识别失败，再检查配置中的 `rootPath` 兜底项
</details>

<details>
<summary><b>📝 中文乱码</b></summary>

1. 检查编码设置
2. 切换到 GBK 编码
3. 重新连接服务器
</details>

<details>
<summary><b>💾 配置文件未更新</b></summary>

1. 检查是否保存了配置文件
2. 配置修改后会立即生效，无需重新加载窗口
3. 如果仍有问题，尝试重新加载VS Code窗口
</details>

---

## 📞 联系方式

- 📧 Email: 279631638@qq.com
- 💬 QQ: 279631638
- 🐛 Issues: [GitHub Issues](https://github.com/serenez/lpc-server-update/issues)

---

## 📄 许可证

[MIT License](LICENSE) © 2024 不一

---

<div align="center">

### 如果这个插件对你有帮助，欢迎给个 ⭐️！

<a href="https://github.com/serenez/lpc-server-update">
  <img src="https://img.shields.io/github/stars/serenez/lpc-server-update?style=social" alt="GitHub stars">
</a>

</div>
