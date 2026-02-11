# 『25时、Nightcord见。』成员们的 24 小时工作日常

<div align="center">

![GitHub License](https://img.shields.io/github/license/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
![GitHub stars](https://img.shields.io/github/stars/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
![GitHub forks](https://img.shields.io/github/forks/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
![GitHub issues](https://img.shields.io/github/issues/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
![GitHub last commit](https://img.shields.io/github/last-commit/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
![GitHub repo size](https://img.shields.io/github/repo-size/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)
[![CodeFactor](https://img.shields.io/codefactor/grade/github/25-ji-code-de/25ji-sagyo?style=flat-square&color=884499)](https://www.codefactor.io/repository/github/25-ji-code-de/25ji-sagyo)

</div>

基于《Project SEKAI》"25时、Nightcord见。"主题的沉浸式作业陪伴网页应用

结合时间同步背景视频、CD 播放器和番茄钟，为你提供专注的学习环境。

## ✨ 特性

- 🕒 **时间同步视频** - 背景视频与现实时间精确同步
- 🎵 **沉浸式音乐** - 完整的 Project SEKAI 曲库，支持多版本切换
- 🍅 **番茄工作法** - 标准番茄钟，支持自定义时长
- 🏆 **成就系统** - 追踪学习进度，解锁特殊成就
- 📡 **实时状态** - WebSocket 实时显示在线人数和活动
- 💬 **聊天功能** - 与其他"25时"成员实时交流
- 🌍 **世界时钟** - 多时区时间显示
- 🔍 **智能搜索** - 支持假名转罗马音搜索

## 🚀 快速开始

### 在线使用

直接访问：**[https://25ji.nightcord.de5.net](https://25ji.nightcord.de5.net)**

无需安装，打开即用！

### 本地运行

```bash
# 克隆仓库
git clone https://github.com/25-ji-code-de/25ji-sagyo.git
cd 25ji-sagyo

# 方式 1: 直接打开
# 在浏览器中打开 index.html

# 方式 2: 使用 Python HTTP 服务器
python3 -m http.server

# 方式 3: 使用 VS Code Live Server
# 安装 Live Server 扩展后，右键 index.html 选择 "Open with Live Server"
```

### 浏览器要求

- 现代浏览器（Chrome, Firefox, Safari, Edge）
- 支持 ES6+ 和 Web Audio API
- 建议启用通知权限以接收番茄钟提醒

## 📁 项目结构

```
25ji-sagyo/
├── index.html                # 主页面
├── style.css                 # 样式文件
│
├── js/
│   ├── core/                 # 核心模块
│   │   ├── video-player.js   # 视频播放器
│   │   ├── time-sync.js      # 时间同步
│   │   ├── hls-handler.js    # HLS 处理
│   │   └── audio-processor.js # 音频处理
│   │
│   ├── components/           # UI 组件
│   │   ├── pomodoro.js       # 番茄钟
│   │   ├── world-clock.js    # 世界时钟
│   │   └── settings-panel.js # 设置面板
│   │
│   ├── cd-player/            # CD 播放器
│   │   ├── index.js          # 入口
│   │   ├── api.js            # 音乐数据 API
│   │   ├── playback-controls.js # 播放控制
│   │   └── visualizer.js     # 可视化
│   │
│   ├── features/             # 功能模块
│   │   ├── achievements.js   # 成就系统
│   │   └── live-status.js    # 实时状态
│   │
│   └── utils/                # 工具函数
│       ├── helpers.js        # 通用工具
│       ├── storage.js        # 本地存储
│       └── search.js         # 搜索功能
│
├── tutorials/                # 教程文档
├── README.md
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
└── LICENSE
```

## 🎯 核心功能

### 1. 时间同步背景视频

- **自动同步**：根据本地时间自动播放对应的视频片段
- **无缝衔接**：视频进度与现实时间精确同步
- **时区支持**：支持本地时间和东京时间切换
- **多种模式**：支持 HLS 流媒体和 MP4 分段播放

### 2. CD 播放器

- **海量曲库**：通过 [Sekai Master DB Diff](https://github.com/Sekai-World/sekai-master-db-diff) 获取音乐数据
- **多版本支持**：Sekai ver. / Virtual Singer ver. / Anvo ver. 等
- **智能播放**：顺序播放、随机播放、单曲循环
- **记忆功能**：自动保存音量、播放列表设置
- **视觉效果**：CD 旋转动画、专辑封面显示

### 3. 番茄工作法

- **标准流程**：25分钟工作 + 5分钟短休息 + 长休息
- **状态保持**：刷新页面不丢失进度（sessionStorage）
- **桌面通知**：计时结束时浏览器通知
- **自定义设置**：可调整工作和休息时长

### 4. 成就系统

- **丰富成就**：番茄钟累计、连续学习天数、累计学习时长、歌曲播放数
- **段位等级**：从 Platinum（白金）到 Emerald（祖母绿）
- **特殊成就**：「25時の住人」（凌晨1点学习）、「朝活 Master」（早起学习）
- **活动记录**：自动记录学习活动，追踪成长轨迹

### 5. 实时状态

- **在线人数**：实时显示当前在线用户数量
- **广播消息**：显示其他用户的活动动态
- **WebSocket 连接**：低延迟实时通信
- **聊天功能**：公共聊天室，支持自定义昵称

### 6. 高级搜索

- **智能搜索**：支持假名转罗马音搜索
- **模糊匹配**：自动文本标准化
- **搜索评分**：基于匹配度的精准排序
- **防抖优化**：减少计算压力，提升响应速度

## 🛠️ 技术栈

![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/css3-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![Cloudflare Pages](https://img.shields.io/badge/Cloudflare%20Pages-F38020?style=for-the-badge&logo=cloudflarepages&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflareworkers&logoColor=white)
![Cloudflare R2](https://img.shields.io/badge/Cloudflare%20R2-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)

- **核心**：原生 HTML5, CSS3, JavaScript（ES6+）
- **部署**：
  - 托管：Cloudflare Pages
  - 逻辑处理：Cloudflare Workers（回源代理）
  - 资源存储：Cloudflare R2
- **数据源**：
  - 音乐数据：[Sekai Viewer](https://github.com/Sekai-World/sekai-viewer)
  - API 网关：[Gateway](https://github.com/25-ji-code-de/gateway)
- **存储**：
  - `localStorage`：用户偏好（音量、播放列表设置）
  - `sessionStorage`：番茄钟运行状态
  - `IndexedDB`：本地音乐文件

## 🏗️ 架构

### 视频同步系统

```
用户访问
  ↓
计算当前时间对应的视频片段
  ↓
HLS 模式（优先）
  ├─ 单一 m3u8 流
  └─ 自动 seek 到对应时间点
  ↓ 不支持
MP4 模式（降级）
  ├─ 6 段模式（4小时/段）
  └─ 3 段模式（8小时/段）
  ↓
每 5 秒检查时间偏移
  └─ 偏移 >3 秒时自动校正
```

### 音乐数据流程

```
CD 播放器初始化
  ↓
从 Gateway API 获取音乐数据
  ↓
解析并缓存到 IndexedDB
  ↓
用户选择歌曲
  ↓
从 R2 加载音频文件
  ↓
Web Audio API 播放
  └─ 可选：音频处理（限幅器、人声消除）
```

## 📚 文档

- **[功能教程索引](./tutorials/README.md)** - 详细的功能使用教程

## 🌐 SEKAI 生态

本项目是 **SEKAI 生态**的一部分。

查看完整的项目列表和架构：**[SEKAI 门户](https://sekai.nightcord.de5.net)**

---

**声明**：本项目受 *Project SEKAI COLORFUL STAGE! feat. Hatsune Miku* 启发。

本项目是非官方、非商业性质的粉丝作品，与 SEGA、Colorful Palette、Crypton Future Media 或任何其他与《Project SEKAI》相关的版权持有方无任何官方关联。

所有游戏相关素材（包括但不限于角色、音乐、图像）的版权归其各自的版权持有方所有。

## 🤝 贡献

欢迎贡献！我们非常感谢任何形式的贡献。

在贡献之前，请阅读：
- [贡献指南](./CONTRIBUTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)

## 🔒 安全

如果发现安全漏洞，请查看我们的 [安全政策](./SECURITY.md)。

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](./LICENSE) 文件。

⚠️ **重要提示**：MIT 许可证仅适用于本项目的原创代码。游戏相关素材（音乐、图像等）的版权归 SEGA、Colorful Palette、Crypton Future Media 等原版权方所有。

## ⚖️ 法律文档

- [版权声明](./COPYRIGHT.md)
- [隐私政策](https://docs.nightcord.de5.net/legal/complete/privacy-25ji)
- [用户服务协议](https://docs.nightcord.de5.net/legal/complete/terms-25ji)

## 📧 联系方式

- **GitHub Issues**: [https://github.com/25-ji-code-de/25ji-sagyo/issues](https://github.com/25-ji-code-de/25ji-sagyo/issues)
- **项目主页**: [https://25ji.nightcord.de5.net](https://25ji.nightcord.de5.net)
- **哔哩哔哩**: [@bili_47177171806](https://space.bilibili.com/3546904856103196)

## ⭐ Star History

如果这个项目对你有帮助，请给我们一个 Star！

[![Star History Chart](https://api.star-history.com/svg?repos=25-ji-code-de/25ji-sagyo&type=Date)](https://star-history.com/#25-ji-code-de/25ji-sagyo&Date)

---

<div align="center">

**[SEKAI 生态](https://sekai.nightcord.de5.net)** 的一部分

Made with 💜 by the [25-ji-code-de](https://github.com/25-ji-code-de) team

</div>
