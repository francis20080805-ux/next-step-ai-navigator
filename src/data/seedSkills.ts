import type { Skill, SkillStage, TaskCategory } from '../domain/types.ts';

type Seed = [string, string, string, string, TaskCategory, SkillStage, string[]];

// These are curated navigation summaries, not redistributed official skill instructions.
const definitions: Seed[] = [
  ['remotion', 'remotion-create', '做视频', '把文案和素材做成一段视频。', 'video', 'create', ['短视频', '宣传视频', '图文视频', '从零做视频']],
  ['remotion', 'remotion-captions', '给视频加字幕', '把说话内容变成字幕，也能调整字幕样式。', 'video', 'edit', ['字幕', '自动字幕', '口播字幕', 'srt']],
  ['remotion', 'remotion-multimedia', '整理视频素材', '把图片、视频、声音和背景音乐放到合适的位置。', 'video', 'edit', ['剪视频', '素材', '背景音乐', '配乐', '产品图片']],
  ['remotion', 'remotion-render', '导出视频', '把做好的视频输出成可以观看和分享的文件。', 'video', 'export', ['导出', '竖屏', '横屏', '1080', '视频文件']],
  ['remotion', 'remotion-best-practices', '检查视频制作方法', '帮助检查视频制作中的常见问题。', 'video', 'check', ['视频代码', '视频制作问题']],
  ['remotion', 'remotion-studio', '预览视频', '先看看画面和声音，再继续调整。', 'video', 'check', ['预览', '看看效果']],
  ['figma', 'figma-use', '调整设计文件', '在已有设计文件中读取或调整页面和组件。', 'design', 'edit', ['Figma', '修改设计', '设计文件', '检查图层']],
  ['figma', 'figma-design-to-code', '把设计图做成网页', '读取设计稿，并按设计制作可用的网页。', 'website', 'design', ['Figma转网页', '设计图转网页', '设计稿', '照着设计图']],
  ['figma', 'figma-generate-design', '制作设计页面', '把想法或已有页面整理成设计稿。', 'design', 'design', ['设计页面', '网页设计稿', '写到Figma']],
  ['figma', 'figma-create-new-file', '新建设计文件', '先准备一个用来制作设计的空白文件。', 'design', 'prepare', ['新建Figma', '创建设计文件']],
  ['figma', 'figma-generate-library', '建立设计组件库', '把常用按钮、颜色和组件整理成可复用的设计库。', 'design', 'design', ['设计组件', '设计系统', '组件库']],
  ['figma', 'figma-generate-diagram', '画流程图', '把步骤和关系画成直观的流程图。', 'design', 'design', ['流程图', '架构图', '关系图']],
  ['figma', 'figma-code-connect', '关联设计与网页组件', '让设计里的组件对应到实际网页组件。', 'design', 'edit', ['Code Connect', '组件映射']],
  ['figma', 'figma-implement-motion', '实现设计中的动画', '把设计中的动画效果做进网页。', 'website', 'edit', ['设计动画', 'Figma动画']],
  ['build-web-apps', 'frontend-app-builder', '做网页和应用', '把你的想法做成可以操作的网页或应用。', 'website', 'create', ['做网页', '做网站', '做APP', 'Web App', '网页开发']],
  ['build-web-apps', 'frontend-testing-debugging', '检查网页问题', '检查按钮、页面和手机显示，找出问题并修好。', 'website', 'error', ['按钮坏了', '网页打不开', '手机错位', '显示异常', '网页报错']],
  ['build-web-apps', 'react-best-practices', '网页代码优化', '让网页运行更顺、更快。', 'website', 'check', ['网页卡顿', '加载慢', '网页性能', '代码优化']],
  ['build-web-apps', 'shadcn', '制作网页组件', '帮助整理和制作网页里的按钮、输入框和菜单。', 'website', 'design', ['shadcn', '网页组件', '组件样式']],
  ['build-web-apps', 'stripe-best-practices', '接入网站收款', '帮助网站接入支付或订阅功能。', 'website', 'create', ['Stripe', '在线收款', '支付', '订阅收费']],
  ['build-web-apps', 'supabase-postgres-best-practices', '网站数据库优化', '网站数据变多以后，检查数据库为什么变慢。', 'website', 'check', ['数据库慢', 'Supabase', 'Postgres', '数据库优化']],
  ['spreadsheets', 'Spreadsheets', '做表格与数据分析', '整理数据、计算统计结果，并做成表格和图表。', 'spreadsheet', 'create', ['销售表', '库存表', '预算表', '记账表', '数据分析', 'Excel', '图表', 'PDF表格']],
  ['spreadsheet-human-ux', 'spreadsheet-human-ux', '让表格更好用', '让表格里的输入、统计结果和操作更容易看懂。', 'spreadsheet', 'check', ['表格好用', '老板能看懂', '表格检查', '数据看板']],
  ['spreadsheets', 'excel-live-control', '操作打开的 Excel', '在已经连接的 Excel 工作簿里查看和修改内容。', 'spreadsheet', 'edit', ['当前Excel', '打开的Excel', '实时Excel']],
  ['presentations', 'Presentations', '制作 PPT', '把重点、数据和图表整理成清楚的演示文稿。', 'presentation', 'create', ['做PPT', '老板汇报', '演示文稿', '销售PPT', '幻灯片']],
  ['documents', 'documents', '写文档', '把内容做成排版清楚的文档，并检查页面效果。', 'document', 'create', ['写文档', 'Word', '报告', '合同', '写文章', '翻译']],
  ['pdf', 'pdf', '处理 PDF', '读取、整理和制作 PDF，也能提取其中的内容。', 'pdf', 'edit', ['PDF', 'PDF表格', '提取PDF', '合并PDF', 'PDF转表格']],
  ['imagegen', 'imagegen', '制作和修改图片', '生成图片，或按你的要求修改已有图片。', 'image', 'create', ['做海报', '图片', '抠图', '去背景', '插画', '产品图']],
  ['google-drive', 'google-drive', '查找云端文件', '在已连接的云端文件里查找、整理或读取资料。', 'research', 'prepare', ['Google Drive', '云端文件', '云盘资料']],
  ['google-drive', 'google-sheets', '处理在线表格', '查看和修改已经连接的 Google 表格。', 'spreadsheet', 'edit', ['Google Sheets', '谷歌表格', '在线表格']],
  ['google-drive', 'google-docs', '处理在线文档', '在已连接的 Google 文档里创建或修改内容。', 'document', 'edit', ['Google Docs', '谷歌文档', '在线文档']],
  ['google-drive', 'google-slides', '修改在线演示文稿', '按已有 Google 演示模板制作内容，或修改现有演示文稿。', 'presentation', 'edit', ['Google Slides', '谷歌幻灯片', '已有演示模板']],
  ['google-drive', 'google-drive-comments', '在文件中写批注', '在云端文件中添加、回复和处理批注。', 'document', 'edit', ['文档批注', '回复批注']],
  ['sites', 'sites', '发布和管理网站', '把完成的网站发布出去，或管理已有网站。', 'website', 'publish', ['发布网站', '网站上线', 'Sites']],
  ['heygen', 'heygen-workflows', '制作口播视频', '用人物、声音和文案制作口播或宣传视频。', 'video', 'create', ['口播视频', '数字人', 'HeyGen']],
  ['remotion', 'remotion-maps', '制作地图视频', '用地图画面展示地点和路线。', 'video', 'create', ['地图视频', '路线动画']],
  ['remotion', 'remotion-markup', '调整视频画面', '调整视频内容、动画和画面效果。', 'video', 'edit', ['视频动画', '调整画面']],
  ['remotion', 'remotion-interactivity', '制作可互动视频', '让视频里的内容支持互动。', 'video', 'edit', ['互动视频']],
  ['remotion', 'remotion-upgrade', '更新视频制作工具', '更新视频项目里的制作工具。', 'video', 'prepare', ['升级Remotion']],
  ['remotion', 'remotion-saas', '开发视频生成应用', '把视频制作功能做成应用。', 'website', 'create', ['视频生成应用', '视频SaaS']],
  ['openai-docs', 'openai-docs', '查阅 AI 产品说明', '查看 AI 产品和开发功能的官方使用说明。', 'research', 'prepare', ['OpenAI', 'Codex说明', 'ChatGPT使用']],
  ['skill-creator', 'skill-creator', '编写自己的能力说明', '把重复任务整理成可以复用的能力说明。', 'other', 'create', ['创建Skill', '自定义Skill']],
  ['skill-installer', 'skill-installer', '安装新能力', '把选好的能力加入你的工作环境。', 'other', 'prepare', ['安装Skill']],
  ['find-skills', 'find-skills', '发现适合的能力', '查找是否有现成能力可以帮助完成你的任务。', 'research', 'prepare', ['找Skill', '查找能力']],
  ['visualize', 'visualize', '制作互动图表', '用可操作的图表说明数据和变化。', 'spreadsheet', 'create', ['互动图表', '模拟器', '交互图表']],
  ['template-creator', 'template-creator', '保存成可重复使用的模板', '把满意的文档、表格或演示样式整理成模板。', 'document', 'check', ['做模板', '可重复模板']],
];

const labels: Record<TaskCategory, string> = {
  video: '视频', spreadsheet: '做表格', presentation: '做 PPT', website: '做网页',
  image: '图片', pdf: '处理 PDF', document: '写文档', email: '发邮件', calendar: '安排日程',
  research: '查资料', design: '设计', other: '其他',
};

function fromDefinition([pluginId, name, chineseName, simpleDescription, type, stage, userPhrases]: Seed): Skill {
  const conditions: string[] = [];
  if (name === 'remotion-captions') conditions.push('needs:captions');
  if (name === 'figma-design-to-code') conditions.push('has:design');
  if (['google-drive', 'google-sheets', 'google-docs', 'google-slides'].includes(name)) conditions.push('uses:cloud');
  if (name === 'stripe-best-practices') conditions.push('needs:payment');
  if (name === 'supabase-postgres-best-practices') conditions.push('needs:database');
  return {
    id: `${pluginId}:${name}`, name, pluginId: ['imagegen', 'openai-docs', 'skill-creator', 'skill-installer', 'find-skills'].includes(pluginId) ? '' : pluginId, chineseName, simpleDescription,
    description: simpleDescription,
    skillMarkdown: `# ${name}\n\n本条是本应用整理的推荐摘要，不是官方完整使用说明。\n\n${simpleDescription}\n\n实际执行请让 Codex 读取当前环境中的同名 Skill。`,
    category: labels[type], tags: [labels[type], ...userPhrases.slice(0, 3)], userPhrases,
    taskTypes: [type], stage, required: false, conditions, excludeConditions: [],
    prerequisites: [], nextSkills: [], githubUrl: '', sourceType: 'system', version: 'catalog-1',
    updatedAt: '2026-10-10T00:00:00.000Z', maintenanceStatus: 'active', capabilityKind: 'skill',
    sourcePath: '', contentHash: '', interpretationStatus: 'ready',
  };
}

function connector(id: string, name: string, chineseName: string, description: string, type: TaskCategory, phrases: string[]): Skill {
  return {
    ...fromDefinition(['connected-services', name, chineseName, description, type, 'create', phrases]),
    id: `connector:${id}`, pluginId: '', capabilityKind: 'connector',
    skillMarkdown: `# ${name}\n\n这是服务连接或联网工具提供的能力，不是独立 Skill 文件。\n\n${description}\n\n本应用只规划和复制任务，不直接发送邮件、创建日程或修改仓库。`,
  };
}

export const seedSkills: Skill[] = [
  ...Array.from(new Map(definitions.map((d) => { const skill = fromDefinition(d); return [skill.id, skill]; })).values()),
  connector('gmail', 'Gmail', '起草和处理邮件', '准备邮件内容，确认后通过已连接的邮箱发送。', 'email', ['发邮件', '客户邮件', 'Gmail']),
  connector('google-calendar', 'Google Calendar', '安排日程', '检查时间是否合适，再安排会议或日程。', 'calendar', ['安排日程', '会议', 'Google Calendar']),
  connector('github', 'GitHub', '查找和处理项目资料', '在已连接的项目仓库里查找资料或处理事项。', 'research', ['GitHub', '仓库资料', '项目问题']),
  connector('web-search', 'Web Search', '查找资料', '在网上查找资料，并核对来源。', 'research', ['查资料', '搜索', '调研']),
];

export default seedSkills;
