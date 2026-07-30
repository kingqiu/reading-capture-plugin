# 跨电脑更新 Reading Capture 插件

这份说明适用于另一台电脑上的人或 Agent。目标是把 GitHub 上指定分支的插件代码，安全安装到该电脑指定 Obsidian Vault 的插件目录中。

## 先确认要更新哪个版本

同一个 Vault 的 `.obsidian/plugins/reading-capture/` 在任一时刻只能安装一个版本；最后一次安装的分支会覆盖前一个版本。不要把两个分支的构建文件混在同一插件目录里。

| 目标 | Git 分支 | 适用范围 |
| --- | --- | --- |
| 通用版 Reading Capture | `main` | 知见录、阅读器、阅读标注和阅读记录等通用功能。 |
| 个人创作工作流版 | `personal/topic-miner` | 包含通用功能，以及个人的创作项目、Skill Runner、Topic Miner 工作流。 |

如果只想使用稳定的阅读与标注功能，选择 `main`。只有在这台电脑已具备个人工作流所需目录与 Skill Runner 配置时，才选择 `personal/topic-miner`。

> 代码同步不会同步你的文章、阅读记录或创作项目数据。这些内容仍由 Obsidian Sync、Google Drive 或你自己的 Vault 同步方案负责。

## 首次准备

另一台电脑需要已经安装 Git、Node.js（建议 18 或更高版本）和 Obsidian。先克隆仓库一次：

```bash
git clone https://github.com/kingqiu/reading-capture-plugin.git ~/Developer/reading-capture-plugin
cd ~/Developer/reading-capture-plugin
```

请将 `~/Developer/reading-capture-plugin` 换成该电脑实际使用的源码目录。不要把源码仓库直接放进 Vault 的 `.obsidian/plugins/` 目录。

## 标准更新流程

下面的 `BRANCH` 只能填 `main` 或 `personal/topic-miner`。`PLUGIN_DIR` 必须是目标 Vault 的实际插件目录，例如：

```text
/Users/你的用户名/Library/CloudStorage/.../Obsidian/.obsidian/plugins/reading-capture
```

```bash
cd ~/Developer/reading-capture-plugin
git fetch origin --prune
git status --short
```

如果最后一条命令有输出，先停止更新：这表示该电脑的源码目录有未提交修改。不要使用 `git reset --hard`、`git clean -fd` 或强制覆盖。应先让维护该电脑的 Agent 说明这些修改来自哪里，再决定保留、提交或另建工作目录。

当工作区干净后，执行：

```bash
BRANCH="main" # 或 personal/topic-miner
git switch "$BRANCH"
git pull --ff-only origin "$BRANCH"
npm run release:check

PLUGIN_DIR="/绝对路径/到/目标Vault/.obsidian/plugins/reading-capture"
test -d "$PLUGIN_DIR"
cp -R dist/reading-capture/. "$PLUGIN_DIR/"
```

`npm run release:check` 会先运行测试，再生成 `dist/reading-capture/`。复制时只覆盖插件程序文件，不会删除 Vault 中的阅读记录或项目资料；不要手动删除 Vault 内容来“清理更新”。

然后在 Obsidian 中执行其一：

1. 打开 **设置 → 第三方插件 → Reload plugins（重新加载第三方插件）**；或
2. 完全退出并重新打开 Obsidian。

## 更新后的验证

完成刷新后，至少验证下面三项：

1. **插件能加载**：设置中的 Reading Capture 仍处于启用状态，没有加载失败提示。
2. **目标功能可用**：`main` 至少打开一篇文章进入 Reading Capture Reader；个人分支再打开一次“创作项目”。
3. **本次更新可见**：按本次更新内容检查一个明确变化，而不是只看到插件仍在列表中。

如果加载失败，在 Obsidian 命令面板执行：

```text
Reading Capture: 导出诊断日志
```

把生成的诊断报告和以下信息交给维护 Agent：选择的分支、源码目录、Vault 插件目录、`git status --short` 输出和 `npm run release:check` 的结果。

## 需要回退时

不要删除 Vault 数据。回退只针对插件代码：在干净源码目录中切到一个已知可用的提交或分支，重新运行构建与复制步骤即可。先用下面命令查看历史：

```bash
git log --oneline --decorate -12
```

确定目标提交后再让维护 Agent 执行回退；不要自行使用破坏性 Git 命令。

## 交给另一台电脑 Agent 的操作说明

将下面这段内容原样交给 Agent，并填入分支和 Vault 路径：

```text
请更新此电脑的 Reading Capture 插件。

仓库：https://github.com/kingqiu/reading-capture-plugin.git
目标分支：<main 或 personal/topic-miner>
源码目录：<本机源码目录；若不存在则先克隆>
Vault 插件目录：<绝对路径>/.obsidian/plugins/reading-capture

请严格阅读仓库 docs/cross-device-plugin-update.md，并按其中“标准更新流程”执行。
要求：
1. 先 git fetch，再检查 git status --short；如果工作区不干净，停止并报告，不得 reset、clean 或覆盖本地修改。
2. 只切换并拉取目标分支，使用 git pull --ff-only。
3. 必须运行 npm run release:check 成功后，才把 dist/reading-capture/ 的内容复制到指定插件目录。
4. 不得删除或修改 Vault 中的文章、阅读记录和创作项目数据。
5. 在 Obsidian 重新加载第三方插件后，完成一次与目标分支相符的实际界面验证，并报告：分支、提交号、测试结果、安装目录和验证结果。
```

