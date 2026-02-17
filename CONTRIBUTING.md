# 贡献指南 (Contributing Guide)

感谢你对 **SEKAI 生态**的关注！我们欢迎任何形式的贡献。

## 🌐 SEKAI 生态

本项目是 SEKAI 生态的一部分。查看完整的项目列表：**[SEKAI 门户](https://sekai.nightcord.de5.net)**

## 🤝 如何贡献

### 报告 Bug

如果你发现了 Bug，请通过 GitHub Issues 报告：

1. 检查是否已有相同的 Issue
2. 使用清晰的标题描述问题
3. 提供详细的复现步骤
4. 说明预期行为和实际行为
5. 提供环境信息（浏览器、操作系统等）
6. 如果可能，提供截图或错误日志

### 提出新功能

我们欢迎新功能建议：

1. 先在 Issues 中讨论你的想法
2. 说明功能的使用场景和价值
3. 如果可能，提供设计草图或示例
4. 等待维护者反馈后再开始开发

### 提交代码

#### 1. Fork 并克隆仓库

```bash
# Fork 仓库后克隆到本地
git clone https://github.com/your-username/25ji-sagyo.git
cd 25ji-sagyo

# 添加上游仓库
git remote add upstream https://github.com/25-ji-code-de/25ji-sagyo.git
```

#### 2. 创建分支

```bash
# 从 main 分支创建新分支
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

#### 3. 进行修改

- 遵循项目的代码风格
- 添加必要的注释
- 确保代码可以正常运行
- 如果需要，更新文档

#### 4. 提交更改

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```bash
# 提交格式
<type>: <description>

# 类型 (type)
feat:     新功能
fix:      Bug 修复
docs:     文档更新
style:    代码格式（不影响功能）
refactor: 重构
test:     测试相关
chore:    构建/工具相关
perf:     性能优化

# 示例
git commit -m "feat: 添加用户头像上传功能"
git commit -m "fix: 修复聊天消息重复显示的问题"
git commit -m "docs: 更新 API 文档"
```

#### 5. 推送并创建 Pull Request

```bash
# 推送到你的 Fork
git push origin feature/your-feature-name

# 在 GitHub 上创建 Pull Request
```

**Pull Request 要求：**
- 清晰的标题和描述
- 关联相关的 Issue（如果有）
- 通过所有测试（如果有）
- 代码审查通过

## 📝 开发规范

### 代码风格

**JavaScript/TypeScript 项目：**
- 使用 2 空格缩进
- 使用 ES6+ 语法
- 变量命名使用 camelCase
- 常量使用 UPPER_SNAKE_CASE
- 类名使用 PascalCase

**关键逻辑必须添加注释：**
```javascript
// ✅ 好的注释
// 计算视频片段和偏移量，基于当前时间
const { part, offset } = computePartAndOffset(currentTime);

// ❌ 不必要的注释
// 设置变量 x 为 10
const x = 10;
```

### Git 工作流

1. **保持分支更新**
```bash
git fetch upstream
git rebase upstream/main
```

2. **小步提交**
- 每个 commit 只做一件事
- commit 信息要清晰明确

3. **避免强制推送**
- 不要使用 `git push --force` 到公共分支
- 如果必须，使用 `git push --force-with-lease`

### 测试

- 如果项目有测试，确保所有测试通过
- 为新功能添加测试（如果适用）
- 手动测试你的更改

## 🔍 代码审查

所有 Pull Request 都需要经过代码审查：

- 维护者会审查你的代码
- 可能会要求修改
- 请及时响应反馈
- 保持友好和专业的态度

## 📚 文档

如果你的更改影响了用户使用方式：

- 更新 README.md
- 更新相关文档
- 添加代码注释
- 如果需要，添加示例

## 🎯 优先级

我们特别欢迎以下类型的贡献：

- 🐛 Bug 修复
- 📝 文档改进
- ♿ 可访问性改进
- 🌐 国际化/本地化
- ⚡ 性能优化
- 🧪 测试覆盖

## ❓ 需要帮助？

- 查看项目的 [README.md](./README.md)
- 浏览现有的 [Issues](https://github.com/25-ji-code-de/25ji-sagyo/issues)
- 在 Issue 中提问
- 查看其他 SEKAI 生态项目的实现

## 📜 行为准则

参与本项目即表示你同意遵守我们的 [行为准则](./CODE_OF_CONDUCT.md)。

## 📄 许可证

通过贡献代码，你同意你的贡献将在 GNU Affero General Public License v3.0 only（AGPL-3.0-only）许可证下发布。

---

再次感谢你的贡献！🎉

<div align="center">

Made with 💜 by the [25-ji-code-de](https://github.com/25-ji-code-de) team

</div>
