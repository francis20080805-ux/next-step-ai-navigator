# 私有在线发布验证

2026-10-13 已使用现有 Sites 账号完成私有发布，没有购买托管、API 或额外额度。

- 实际网址：https://next-step-ai-navigator.francis20080805.chatgpt.site
- 项目：`appgprj_6aca281e07348191b5ff5a41eddd563c`
- 原生发布结果：`succeeded`，版本 1，更新时间 `2026-10-13T05:18:16.918264+00:00`。
- 部署：`appgdep_6acdbefb48648191972bf10e39f691c4`
- 保存版本：`appgprj_6aca281e07348191b5ff5a41eddd563c~appgver_9bde114e34808191bc42a6f40544febb`
- 发布后重新读取访问策略：当前用户是 owner；custom 范围只有 owner，外部访客 0、组 0；没有更改分享范围。
- 实际 HTTP 访问核对：未授权请求返回 401；使用平台提供、仅发送到本站的临时访问凭证后，首页返回 200，并包含“下一步”标题及应用入口。发布的 JS 和 CSS 各返回 200。临时凭证没有写入文件、源码或日志。

完整公开源码和能力目录保留在 GitHub。Sites 的 Git 服务拒绝大型目录对象，因此站点使用工作区内独立的源码 checkout，不携带巡检游标和个人文件。构建从公开仓库固定提交 `fa5cb253e52549e3743733e8adc56b1b8f87bc16` 下载能力快照，并校验 SHA-256 `02cb1c81bb786e3584ebfc9804e4bcab0589e9709222bb26dcb26167cb62e5a2`。快照含 1159 条真实 GitHub Skill，其中 774 条用途已确认，可参与推荐。

Sites 专用源码提交 `d393af56c6c5df83c715d0d46dfcaf7155a31d64` 已由官方 source helper 推送并核对远端 HEAD，工作树干净。该源码完成 TypeScript 检查和 Vite 生产构建；JS/CSS 文件与已完成浏览器验收的本机产物一致。部署归档使用官方 `prepare-site-build.cjs` 规范化静态输出，再用 Windows 内置 tar 打包；归档只含静态页面、资源、通用目录和托管清单。

Windows 环境缺少 bash，官方包装入口无法启动；已用上述等价打包路径处理。初始托管清单含不支持的 version/build 字段，发布前已改成受支持的 project_id/static 清单。前两次失败没有被标记为上线；本次上线依据原生工具返回的终态成功和实际 URL。

Sites 工具没有单独提供托管费用额度查询。发布过程没有触发付款或购买操作；不将插件连接标志解释为免费额度证明。线上页面的 AI 仍由配对后的本机服务调用已有 Codex 登录额度，手机无法连接其他电脑的 localhost。
