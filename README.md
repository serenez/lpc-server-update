# 🎮 LPC服务器连接器

<div align="center">

[![Version](https://img.shields.io/badge/version-1.1.3-blue.svg?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=BUYI-ZMuy.lpc-server-update)
[![License](https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge)](LICENSE)
[![QQ](https://img.shields.io/badge/QQ-279631638-red.svg?style=for-the-badge)](https://qm.qq.com/cgi-bin/qm/qr?k=XcJNDH3-8WTdP0snH8g88KbiXyeIcNI5)

一个专业的 VS Code 扩展，为 LPC 游戏开发者提供完整的服务器连接和管理解决方案。

![演示](https://media3.giphy.com/media/v1.Y2lkPTc5MGI3NjExZHhrc3pzMzlqbGUyaW44cHNyb3Nra3R5czltMng0dDc2Z25xcm5jcyZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/fkWveGpBG8jT6mlvjF/giphy.gif)

</div>

---

推荐LPC语法检查，语法高亮，函数提示等功能插件：[LPC language-server](https://marketplace.visualstudio.com/items?itemName=jlchmura.lpc)

此插件配置文件为：'项目根目录/lpc-config.json'(该插件极度依赖配置文件，得以获取更好的体验)

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

## 🚀 快速开始

### 1️⃣ 安装
1. 打开 VS Code
2. 按下 `Ctrl+P`
3. 输入 `ext install BUYI-ZMuy.lpc-server-update`

### 2️⃣ 配置
在 `.vscode/muy-lpc-update.json` 中配置：

<pre>
<code class="json">{
    "host": "服务器地址",
    "port": 端口号,
    "username": "巫师账号",
    "password": "密码",
    "serverKey": "buyi-SerenezZmuy",
    "encoding": "UTF8",
    "loginKey": "登录KEY",
    "compile": {
        "autoCompileOnSave": false,
        "defaultDir": "",
        "timeout": 30000
    }
}</code>
</pre>

### 3️⃣ 开始使用
1. 点击左侧活动栏的 LPC 图标
2. 点击 "连接游戏服务器"
3. 开始编码！

---

## 🛠️ 功能特性

### 🔌 服务器连接
- 一键连接/断开服务器
- 支持 UTF8/GBK 编码
- 智能重连机制
- 实时状态监控

### 📝 代码编译
- 快速编译当前文件
- 支持整个目录编译
- 错误实时提示与定位
- 点击错误直接跳转

### 💻 命令管理
- 自定义命令快捷执行
- 支持 Eval 命令
- 服务器重启管理
- 实时执行反馈

### 📊 消息系统
- 分类消息显示
- 自动滚动/锁定
- 支持消息清理
- 自定义消息样式

---

## 🔒 安全注意事项

- 🚫 禁止在公共场合分享配置文件
- 📝 建议将 `muy-lpc-update.json` 添加到 `.gitignore`
- 🔑 定期更改密码和验证密钥
- 🛡️ 确保服务器端口的安全性

---

## ❓ 常见问题

<details>
<summary><b>🔌 连接失败</b></summary>

1. 检查服务器地址和端口
2. 确认网络连接
3. 验证登录信息
</details>

<details>
<summary><b>⚠️ 编译错误</b></summary>

1. 检查文件路径
2. 查看错误信息
3. 确认编码设置
</details>

<details>
<summary><b>📝 中文乱码</b></summary>

1. 检查编码设置
2. 切换到 GBK 编码
3. 重新连接服务器
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
