# 本机服务与 GitHub 巡检验收

验证日期：2026-10-10；收尾复核：2026-10-11（香港时间）；环境：Windows、Node 24.19.0。本记录区分真实服务调用、模拟边界测试和仍需观察的事项。

## 已实际验证

| 检查 | 实际结果 |
| --- | --- |
| TypeScript | `node node_modules/typescript/bin/tsc --noEmit` 通过。 |
| 后端回归 | 当前 19 项全部通过，包含公开快照原文读取、旧设置迁移、后台解释队列、25 MB 流式体积限制、同步重试隔离和同源 Referer。 |
| 整体回归 | `node --experimental-strip-types --test tests/*.test.ts`，当前 45 项全部通过，包括核心推荐和浏览器数据备份验证；收尾再次运行 `tsc --noEmit` 通过。 |
| 真实 ChatGPT AI | 已登录的本机 Codex 完成 HTTP 配对及 `/api/tasks/interpret` 调用，返回 HTTP 200、`mode=codex`，必须同时收到 `agent_message` 和 `turn.completed` 才确认成功。 |
| 视频需求理解 | “视频已经做好了，只要加字幕，不要加音乐，最后导出”识别为已有视频，字幕、仅加字幕、导出为必需，音乐为排除；生成 2 个待做步骤，无降级提示。 |
| 真实 Skill 中文解释 | 同一 ChatGPT 登录实际解释一份表格 Skill，返回“电子表格助手”和完整中文用途，结构校验后 `interpretationStatus=ready`、展示分类“做表格”；前置与后续关联均为空，没有编造关联。 |
| 真实 GitHub | 对 `openai/plugins` 执行小配额扫描，真实读取 1 份新 Skill 文档、固定 commit 链接与 blob 内容标识；本轮达文档额度后返回 partial 并保存继续检查的游标。没有将部分扫描宣称为全库扫描完成。 |
| 真实 Actions 首轮 | [公开仓库首轮运行](https://github.com/francis20080805-ux/next-step-ai-navigator/actions/runs/38051430280) 已完成且结论为 success；匿名 Actions API 收尾复核 HTTP 200。本轮提交的通用快照含 86 条真实 Skill，`openai/plugins` 仍为 partial，保留游标，Remotion 尚待后续轮次。 |
| 真实公共目录同步 | 后续巡检目录已增长至 470 条；复用此机已有系统代理并启用 Node 环境代理后，真实 `readPublicCatalog` 读取 470 条，用时约 17.85 秒。未提供 GitHub 认证，也未增加 AI 调用。 |
| 网络兼容 | 此机直接访问 `raw.githubusercontent.com` 曾出现 ECONNRESET；扫描器已实测自动改用 GitHub Contents API 并保留固定 commit。Codex 初始直接访问失败，启用其 `respect_system_proxy` 后真实 AI 成功。未读取或输出认证凭据。 |

19 项回归涵盖 Origin/Host 白名单、一次性配对、内存 token、禁止任意命令入口、AI 结构验证及关联 ID、每日后台用量持久化、相同内容复用解释、备份恢复、添加立即检查、树截断递归、固定 commit、限额后续扫、404/网络失败不误删，以及文档读取备用路径。新检查确认未完整扫描时仍保留准确的已发现能力数量、公共快照的 pending 文档进入后台解释、相同内容的 ready 解释不会重复调用 AI；14 MB 级内容可读取，超过 25 MB 的声明或实际流式内容均拒绝。公共目录网络失败不阻塞已有待解释文档，重启保留重试时间。AI 解释的英文分类统一映射到中文展示分类。

本机备份接口为 `GET /api/backup` 与 `POST /api/backup/restore`（请求 `{backup: 导出的对象}`），均需配对 token。格式包含 `schemaVersion:1`、`kind:ai-navigator-bridge-backup`、导出时间、Skill 原文与解释、仓库、作者、检查记录、设置、发现时间及公共目录的尝试／成功时间。恢复会校验来源与数据结构，将旧运行中记录转为暂停；检查尚在进行时返回 409。备份不包含会话 token、连接码或 Codex 凭据；恢复也不会重置本机当日 AI 使用计数。旧版没有同步状态的备份可恢复，并重新检查公共目录。浏览器中的任务与收藏仍由浏览器备份另行保存。

## 运行行为

- `pnpm dev` 启动网页与本机服务；生产本机使用先 `pnpm build`，再 `pnpm start`。服务只绑定 `127.0.0.1:8787`，启动显示 15 分钟内一次有效的连接码。本机网页也需要配对。
- 本机响应使用 `Referrer-Policy: same-origin`，保留生产浏览器同源 GET 所需的 Referer；没有 Origin 时仅接受带 `Sec-Fetch-Site: same-origin` 的有效白名单 Referer。显式恶意 Origin、跨站请求、恶意 Referer 和缺少两者的请求仍拒绝。
- 线上网页域名须通过环境变量 `ALLOWED_ORIGINS` 加入精确 origin 白名单，再重新启动服务。浏览器仍可能要求允许连接本机网络；此验收不把线上跨源连接当成已经逐浏览器验证。
- AI 使用现有 ChatGPT 登录，仅调用官方 OpenAI provider。命令使用临时工作目录、临时会话、只读沙箱、JSON schema；Shell、Apps、浏览器、Hooks、Plugins 等能力关闭。API-key 登录会被拒绝，超时、额度不足或结构错误会明确退回本地推荐。
- 前台理解在待执行队列中优先；已运行的一次后台调用会先完成。后台每天最多尝试解释 20 项，用量与额度暂停状态持久化，按香港时区日期计算。此上限是应用限制，实际可用量仍取决于用户现有 ChatGPT 额度。
- 后台每分钟检查是否到期，仓库、热门及作者发现以 6 小时为到期间隔，分批保留游标。添加仓库即检查，添加作者即发现该作者的公开仓库。关闭网页后本机进程继续工作；关闭服务、关机或休眠期间无法巡检。它尚未注册为 Windows 开机服务。
- 默认 GitHub 扫描无需个人 token；本机每小时最多发起 50 个 API 请求，每次扫描还有请求与文档上限。遇限额、网络失败或树不完整保留目录与游标；仅完整读取同一 commit 的目录后，才把确实缺失的旧路径标为已移除，保留历史记录与原文。
- 热门来源定义为 3 个明确 Skill 相关搜索各自按 star 排序的前 100 个仓库去重集合；这是可复现的候选范围。作者发现分页获取其公开原创仓库，再逐个检查实际 `SKILL.md`。插件名由元数据解析；没有 `SKILL.md` 的连接器不会被伪装成 Skill。
- 相同 Skill ID 与内容标识保持已保存的中文解释，允许更新检查时间与维护信息；文档变化后重新排队解释。未知用途或 AI 暂不可用时保留原文并显示待解释，不伪造已完成解释。
- 公共目录读取上限为 25 MB、请求超时 60 秒，URL 白名单和无认证要求保持不变。尝试时间与成功时间分别持久化：成功后 6 小时再同步，失败 30 分钟后重试；失败保存一条暂停记录，继续处理已经保存的待解释文档。
- Windows 启动入口复用已经配置的系统代理，不新建代理服务；存在 HTTPS 代理时启用 `NODE_USE_ENV_PROXY`，本机地址经 `NO_PROXY` 直连。

GitHub 对匿名 REST 请求按 IP 限制每小时 60 次；同网络其他程序也可能消耗额度，因此分批巡检可能跨多个周期。[GitHub REST 限流文档](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

GitHub 递归 Git tree 的截断上限为 100,000 项／7 MB；扫描器在 `truncated=true` 时逐子树读取，不能据截断结果判定删除。[Git tree 官方文档](https://docs.github.com/en/rest/git/trees#get-a-tree)

## 已启用的公共巡检

`.github/workflows/public-catalog.yml` 已配置公开仓库的标准 `ubuntu-latest` runner、Node 24、pnpm 11.25.0 与现有锁文件，每 6 小时的第 17 分钟检查官方及热门通用来源。每次最多 120 次 API 请求、100 份文档，轮转扫描来源，保存目录与完整原文到 `public/catalog-snapshot.json`，扫描游标单独保存在 `.github/catalog-scan-state.json`；检查时间属于快照数据，真实发生检查后会更新。只有内容变化才提交。分离游标后 470 条通用目录约 5.23 MB，没有删减 Skill 原始 Markdown。

CI 只使用 GitHub 自动发放的临时 `GITHUB_TOKEN`，不读取本机 `.data`、个人任务、收藏作者或 Codex 认证。公开目录不在 CI 调用 AI；已理解的通用中文说明可以与原文一同分发，新文档由本机服务在用户现有额度内解释。本次额外通过当前对话逐项理解真实原文，不调用另一份 Codex 会话或收费 API。默认同步链接为 `https://api.github.com/repos/francis20080805-ux/next-step-ai-navigator/contents/public/catalog-snapshot.json`，请求使用 `Accept: application/vnd.github.raw+json`，不附带任何认证，拒绝 Contents 元数据包装与不合法地址；旧空设置迁移至该链接，备份恢复接受同一受限格式。

公开仓库的工作流已经真实完成首轮并写回目录快照，成功记录见上表。收尾曾发现 372 条目录携带扫描游标后达 14,184,435 字节，超出旧 10 MB 限制；已扩大读取上限、分离 CI 游标并验证保留所有原文。此机直接连接曾超过 60 秒；复用已有系统代理后真实读取当前 470 条目录成功，耗时约 17.85 秒。同步失败仍会保留目录并独立重试，继续解释已保存的文档。公开仓库使用标准 GitHub-hosted runner 按当前规则免费；这里没有创建私有 runner 或付费后端。[GitHub Actions 费用说明](https://docs.github.com/en/actions/concepts/billing-and-usage)

定时任务可能延迟或被丢弃，公开仓库连续 60 天没有活动时会自动停用；它不能承诺持续准时执行。第 17 分钟用于避开整点高峰，用户仍需留意 Actions 状态。[GitHub schedule 官方说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

以上真实 AI、GitHub、Actions 与模拟边界结果证明本机路径及公共巡检可运行；实时公共目录同步的网络稳定性、长期无人值守任务、整库扫描及不同浏览器本机网络授权仍需继续观察。公共 Actions 首轮成功不等于私有网页已经上线，也不等于官方整库已经扫描完成。
