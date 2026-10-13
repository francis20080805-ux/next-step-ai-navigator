# 下一步 · AI 任务导航器

用大白话说出需求，找到“现在用 → 下一步 → 最后”的任务流程。保存进度、恢复历史，把剩余任务复制给 Codex 执行。

React + Vite + TypeScript；本机 Node.js 服务；个人数据留在本机。没有付费 API、购买额度或收费服务回退。

## Windows 启动

1. 双击根目录的 **启动下一步.cmd**。已有 Codex 桌面运行环境会自动复用其中的 Node；其他电脑安装 Node.js 24 或更新版本。
2. 首次启动安装免费依赖并构建，随后浏览器打开 http://127.0.0.1:8787 。
3. 在网页“设置”中填写服务窗口显示的 **连接码**，连接地址保留 `http://127.0.0.1:8787`。
4. Codex 需已通过 ChatGPT 登录（`codex login status`）。连接码有效期 15 分钟，仅能使用一次；重启服务会生成新码。

保持服务窗口运行，关闭网页后仍会检查来源。关闭窗口或电脑关机后暂停；下次启动补查。手机可以使用在线页面的本地规则，但手机上的 `localhost` 指向手机，不能连接另一台电脑的 Codex。

“复制给 Codex”生成可执行提示词：先说明当前步骤的操作，再明确调用真实 Skill 和所属插件，并附原始需求、参数及剩余流程。“开始这个任务”保存状态并提供同一份文本；将文本粘贴到 Codex，才能实际制作视频、表格等文件。

## 推荐排行榜

侧栏的“推荐榜”提供两种排序，也可从手机的“更多”打开。推荐榜优先适合普通用户的常用能力，再考虑维护状态和仓库热度；高星榜按最近扫描取得的真实 GitHub **仓库** star 排序。同一个 Skill 的多个来源仅在榜中合并显示，完整能力库和任务步骤仍保留各自记录。

支持按视频、表格、PPT、网页等用途筛选，搜索中文、英文和口语，收藏、查看原文与所需工具。默认显示前 20 项，可以查看更多。用途未确认、来源移除或已停用的能力不进入排行；收录与排名不表示插件已安装，也不是用户使用量统计。

## 开发与生产

```powershell
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
pnpm start
```

开发网页端口 5173，本机接口端口 8787。所有服务只绑定 `127.0.0.1`。支持 Node 24 的内置 TypeScript 擦除，不依赖 tsx 服务启动器。

AI 通过官方 `codex exec` 读取标准输入，在独立临时目录、只读沙箱中输出 JSON Schema 结果。禁用无关工具、插件、浏览器、Shell 和连接器；强制 ChatGPT 登录；不读、不上传 Codex 凭据文件。Windows 系统代理通过 CLI 官方 `respect_system_proxy` 功能支持。网络、额度或输出错误会明确回退到本地规则；未知任务继续澄清，未解释的新能力不参与推荐。[官方非交互说明](https://learn.chatgpt.com/docs/non-interactive-mode)

## 保存、导入与恢复

- 浏览器 IndexedDB：任务、历史、收藏、能力缓存和设置。不同浏览器及本机/在线域名的数据相互独立。
- `.data/bridge-state.json`：个人来源、作者、原始 Markdown、扫描/解释队列、每日解释计数。文件原子写入，Git 忽略该目录。
- 设置 → 导出备份/恢复备份：版本化浏览器 JSON；不完整的备份在覆盖前拒绝。
- 高级设置 → 导出本机目录/恢复本机目录：独立备份服务数据，需先配对；不包含登录凭据或会话令牌。
- 能力库支持上传/粘贴 Markdown。AI 未连接时，未知内容等待解释；也可以填写中文用途并确认。公共目录 JSON 在高级设置导入，应用备份 JSON 用“恢复备份”。

## GitHub 免费巡检

公开源码： https://github.com/francis20080805-ux/next-step-ai-navigator 。

`.github/workflows/public-catalog.yml` 在 UTC 每六小时的第 17 分钟检查官方和热门来源，也支持 Actions → Run workflow。标准公开仓库 runner 免费；计划运行可能延迟，仓库长期无活动也可能停用，需手动恢复。[费用说明](https://docs.github.com/en/actions/concepts/billing-and-usage) · [调度限制](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

CI 只读取公开仓库，写最新 `public/catalog-snapshot.json` 和游标，不调用个人 Codex，不包含个人任务、作者收藏、凭据或导入文件。官方源为 `openai/plugins` 和 `remotion-dev/skills`；历史 `openai/skills` 已弃用。README 仅补充背景，只有真实 SKILL.md 才收录。

热门来源按跨主题查询的真实 stars 排序。扫描树游标单独保存在 `.github/catalog-scan-state.json`，不会让网页重复下载大型目录树；每轮先检查官方来源，再继续热门仓库的断点。已经整理好的中文说明在内容哈希未变化时保留，源文改变后重新进入解释队列。

能力库收录公开来源的说明，不代表这些插件已在你的 Codex 中安装或账号已连接。详情保留原文、出处与前置条件，复制提示词会要求确认当前可用能力。普通本地办公任务优先使用对应文件 Skill，外部服务需明确指定并使用已有权限，不自动购买服务。

本机每六小时检查个人来源与作者；按固定提交扫描、保留游标和内容哈希。网络失败/限流不标记删除；只有完整成功扫描能确认文件消失。同一内容不重复解释，后台每日最多 20 次中文解释，前台任务优先。

## 私有在线页面

使用 Sites 的账号私有访问范围，不开启公开分享；部署是否成功以验证记录为准。线上静态页面不保存服务器任务、不接收凭据，连接电脑时仍需要一次性配对。

复制 `.env.example` 为 `.env`，将 `ALLOWED_ORIGINS` 填为实际在线地址的 origin，再重启本机服务。当前交付电脑已设置该值；其他网页会被拒绝。浏览器若拒绝本机网络访问，请允许该页面访问本机网络，或直接打开本机地址继续；已有数据不会删除。

## 代码与验证

独立逻辑位于 `src/core/`；浏览器保存/桥接客户端位于 `src/services/`；Node API、Codex 和 GitHub 扫描位于 `server/`。能力来自真实安装技能的人工中文摘要，原始完整说明需执行时由 Codex 读取；连接器独立标识。

设计规范见 `design/spec.md`，完整验收记录见 `docs/verification.md`。测试包含任务顺序、条件否定、进度 ID、备份边界、配对安全、固定提交、断点续扫、删除确认和无效 AI 输出。浏览器验证使用隔离 Playwright 上下文。
