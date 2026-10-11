import type { Skill, SkillStage, TaskIntent, TaskRecord, WorkflowStep } from '../domain/types.ts';
import { matchSkill } from './SkillMatcher.ts';

type PlannedAction = { action: string; title: string; description: string; stage: SkillStage; optional?: boolean };

export function planWorkflow(intent: TaskIntent, catalog: Skill[], previous?: TaskRecord): WorkflowStep[] {
  const actions: PlannedAction[] = [];
  const add = (action: string, title: string, description: string, stage: SkillStage, optional = false) => {
    if (!actions.some((step) => step.action === action)) actions.push({ action, title, description, stage, optional });
  };
  const needs = (name: string) => intent.requirements[name] === 'required';
  const old = (action: string) => previous?.steps.some((step) => step.action === action);
  const hasGoal = (pattern: RegExp) => intent.goals.some((goal) => pattern.test(goal));
  const is = (category: TaskIntent['category']) => intent.category === category;
  const needsData = intent.missingMaterials.some((material) => /数据/.test(material));

  if (is('video') || hasGoal(/视频/)) {
    if (!intent.hasExistingOutput || old('video.create')) add('video.create', '做视频', '根据你的文案和素材制作视频。', 'create');
    const media = needs('music') || intent.existingMaterials.some((material) => /图片|照片|音乐|声音|素材/.test(material)) || intent.subtype === '剪辑';
    if (media && !needs('onlyCaptions')) add('video.materials', needs('music') ? '加图片和音乐' : '整理视频素材', '把需要的素材放进视频，调整顺序和节奏。', 'edit');
    if (needs('captions')) add('video.captions', '给视频加字幕', '生成或整理字幕，并检查字幕时间。', 'edit');
    if (intent.requirements.export !== 'excluded') add('video.export', '导出视频', '输出可以观看和分享的视频文件。', 'export');
  }

  const salesPresentation = is('presentation') && (intent.subtype === '销售汇报' || hasGoal(/销售|数据/) || needs('analysis'));
  const spreadsheet = is('spreadsheet') || hasGoal(/表格|库存|预算|数据分析/);
  if (spreadsheet && hasGoal(/PDF/)) add('pdf.edit', '提取 PDF 数据', '先读取 PDF，再把其中的数据整理到表格。', 'prepare');
  if (spreadsheet || salesPresentation) {
    if (spreadsheet && !intent.hasExistingOutput) {
      const title = intent.subtype === '库存表' ? '建库存表' : intent.subtype === '预算表' ? '建预算表' : intent.subtype === '销售表' ? '建销售统计表' : intent.subtype || '做表格';
      add('spreadsheet.create', title, '先建立清楚的表格结构和填写位置。', 'create');
    }
    if (needsData) add('data.prepare', '准备销售数据', '请准备实际销售数据；当前还没有提供这些资料。', 'prepare');
    add('data.organize', intent.subtype === '库存表' ? '整理商品信息' : intent.subtype === '预算表' || intent.subtype === '收支表' ? '整理收支数据' : '整理数据', '统一名称、日期和数量，检查缺失或重复的内容。', 'edit');
    if (intent.subtype === '库存表') add('spreadsheet.quantity', '记录商品数量', '补充商品数量，明确入库和出库记录。', 'edit');
    add('data.analyze', intent.subtype === '库存表' ? '做库存统计' : salesPresentation ? '分析销售重点' : '做统计分析', '计算关键结果，找出值得关注的变化。', 'check');
    if (intent.requirements.charts !== 'excluded' && (needs('charts') || salesPresentation || intent.subtype === '销售表')) add('data.charts', '做图表', '把关键数据做成直观的图表。', 'create');
    else if (intent.requirements.charts === 'unspecified' && ['预算表', '收支表', '记账表', '数据统计'].includes(intent.subtype)) add('data.charts', '按需要做图表', '需要直观看变化时，把统计结果做成图表。', 'create', true);
    if (needs('dashboard')) add('data.dashboard', '做数据看板', '把重要统计和图表放在一起，方便查看。', 'create');
    if (!salesPresentation && needs('check')) add('spreadsheet.check', '检查表格', '检查公式、输入和展示是否清楚。', 'check');
  }

  if (is('presentation') || hasGoal(/PPT|演示文稿/i)) {
    if (!intent.hasExistingOutput || old('presentation.create')) add('presentation.create', '制作 PPT', '把重点和图表组织成清楚的演示文稿。', 'create');
    else add('presentation.create', '修改已有 PPT', '在现有演示文稿或模板上整理内容。', 'edit');
    add('presentation.check', '检查 PPT', '检查重点、排版、图表和页面效果。', 'check');
  }

  if (is('website') || hasGoal(/网页|应用/)) {
    if (intent.hasError) {
      add('website.debug', '检查网页问题', '检查页面、按钮和手机显示，修复发现的问题。', 'error');
    } else if (!intent.hasExistingOutput || old('website.create')) {
      if (intent.hasDesign) add('website.designread', '把设计图变成网页', '读取已有设计稿，明确页面内容和样式。', 'design');
      add('website.create', '开发网页', '把需求做成可以使用的网页或应用。', 'create');
    }
    if (needs('components')) add('website.components', '制作网页组件', '整理需要的按钮、输入框和菜单。', 'design');
    if (needs('payment')) add('website.payment', '接入网站收款', '根据你的需求接入支付或订阅。', 'create');
    if (needs('optimize')) add('website.optimize', '优化网页速度', '检查加载和运行速度，调整性能问题。', 'check');
    if (needs('database')) add('website.database', '检查数据库速度', '检查数据访问和查询是否造成变慢。', 'check');
    if (!intent.hasError || needs('check') || needs('responsive')) add('website.check', '检查电脑和手机显示', '确认页面和操作在不同屏幕上都正常。', 'check');
    if (needs('publish')) add('website.publish', '发布网站', '准备并发布完成的网站。', 'publish');
  }

  if (is('pdf') || hasGoal(/PDF/)) add('pdf.edit', '处理 PDF', '按你的要求读取、整理、提取或制作 PDF。', 'edit');
  if (is('image') || hasGoal(/制作图片|修改图片|海报/)) add(intent.hasExistingOutput ? 'image.edit' : 'image.create', intent.hasExistingOutput ? '修改图片' : '制作图片', '根据你的描述制作或调整图片。', intent.hasExistingOutput ? 'edit' : 'create');
  if (is('document') || hasGoal(/文档|文章|报告|翻译/)) {
    add('document.create', intent.hasExistingOutput ? '修改文档' : '写文档', '整理内容，制作排版清楚的文档。', intent.hasExistingOutput ? 'edit' : 'create');
    add('document.check', '检查文档', '检查文字和排版，确认内容符合要求。', 'check');
  }
  if (is('design')) {
    if (intent.subtype === '流程图') add('design.diagram', '画流程图', '把步骤和关系整理成图。', 'design');
    else {
      if (!intent.hasExistingOutput) add('design.file', '新建设计文件', '准备一个用来设计的文件。', 'prepare');
      add(intent.hasExistingOutput ? 'design.edit' : 'design.create', intent.hasExistingOutput ? '调整设计稿' : '制作设计页面', '根据需求制作或调整设计稿。', 'design');
      if (needs('components')) add('design.library', '建立设计组件库', '把常用设计组件整理成可复用的组件库。', 'design');
    }
  }
  if (is('email') || hasGoal(/邮件/)) {
    add('email.draft', '起草邮件', '根据你的目的写清楚邮件主题和正文。', 'create');
    add('email.send', '检查内容后发送', '确认收件人和内容，再通过已连接的邮箱发送。', 'check');
  }
  if (is('calendar')) {
    add('calendar.availability', '检查时间安排', '先确认时间和参加人是否合适。', 'prepare');
    add('calendar.create', '安排日程', '确认后在已连接的日历里安排日程。', 'create');
  }
  if (is('research')) add(intent.subtype === 'GitHub' ? 'research.github' : 'research.search', '查找和核对资料', '查找资料，并保留可以核对的来源。', 'prepare');

  // Completion is attached to an action instance, never to a skill ID.
  const steps = actions.map((entry): WorkflowStep => {
    const previousStep = previous?.steps.find((step) => step.action === entry.action);
    const skill = matchSkill(entry.action, intent, catalog);
    return {
      id: previousStep?.id ?? crypto.randomUUID(), action: entry.action, title: entry.title,
      description: entry.description, skillId: skill?.id ?? null, skillName: skill?.name ?? '',
      capabilityKind: skill?.capabilityKind ?? 'skill', stage: entry.stage,
      status: intent.completedActions.includes(entry.action) || previousStep?.status === 'completed' ? 'completed' : previousStep?.status === 'skipped' && entry.optional ? 'skipped' : 'pending',
      optional: Boolean(entry.optional), dependencies: [],
    };
  });
  if (previous) {
    const completedHistory = previous.steps.filter((step) => (step.status === 'completed' || intent.completedActions.includes(step.action)) && !steps.some((current) => current.action === step.action));
    steps.unshift(...completedHistory.map((step) => ({ ...step, status: 'completed' as const, dependencies: [...step.dependencies] })));
  }
  // A small ordered plan is sufficient for v1. Dependencies remain explicit for later executors.
  for (let i = 1; i < steps.length; i++) steps[i].dependencies = [steps[i - 1].id];
  return steps;
}

export function completeStep(task: TaskRecord, stepId: string): TaskRecord {
  const step = task.steps.find((entry) => entry.id === stepId);
  if (!step) throw new Error('没有找到这一步，请刷新任务后重试。');
  if (step.dependencies.some((id) => task.steps.some((dependency) => dependency.id === id && dependency.status === 'pending' && !dependency.optional))) throw new Error('请先完成前面的步骤。');
  const steps = task.steps.map((entry) => entry.id === stepId ? { ...entry, status: 'completed' as const } : entry);
  return {
    ...task, steps, intent: { ...task.intent, completedActions: [...new Set([...task.intent.completedActions, step.action])] },
    updatedAt: new Date().toISOString(), status: steps.every((entry) => entry.status !== 'pending') ? 'completed' : 'started',
  };
}

export function buildCodexPrompt(task: TaskRecord, catalog: Skill[] = []): string {
  const pending = task.steps.filter((step) => step.status === 'pending');
  const completed = task.steps.filter((step) => step.status === 'completed');
  const skipped = task.steps.filter((step) => step.status === 'skipped');
  const current = pending[0];
  const capability = (step: WorkflowStep) => catalog.find((skill) => skill.id === step.skillId);
  const capabilityLabel = (step: WorkflowStep) => {
    const skill = capability(step);
    const name = skill?.name || step.skillName;
    if (!step.skillId || !name) return '需要用户提供资料，暂不调用 Skill';
    if ((skill?.capabilityKind ?? step.capabilityKind) === 'connector') return `需要连接的服务：${name}（连接器，不是 Skill）`;
    const invokeName = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(name) ? `（$${name}）` : skill?.sourcePath ? `（原始路径：${skill.sourcePath}）` : '';
    return `${skill?.pluginId ? `插件「${skill.pluginId}」中的 ` : ''}Skill「${name}」${invokeName}`;
  };
  const operation = (step: WorkflowStep) => {
    if (step.action === 'video.create' && task.intent.subtype === '剪辑') return '使用我提供的视频素材剪辑短视频：裁掉多余片段，按原始需求调整片段顺序、节奏和画面，保留原始素材。';
    if (step.action === 'video.captions') return '在已有视频上生成或校对字幕，校准字幕的起止时间，并按原始需求设置字幕样式；保留已经完成的画面和音频。';
    if (step.action === 'video.export') return '把已经完成的视频导出为可播放的文件，使用下方指定的时长、尺寸、方向和格式；检查播放、画面、声音及需要的字幕，并给出成品文件。';
    return step.description;
  };
  const parameters = Object.entries(task.intent.parameters).filter(([, value]) => Boolean(value));
  const requirementNames: Record<string, string> = { captions: '字幕', music: '背景音乐', charts: '图表', export: '导出', analysis: '数据分析', check: '检查结果', responsive: '适配手机和电脑', publish: '发布', payment: '网站收款', database: '数据库', optimize: '性能优化', components: '组件', dashboard: '数据看板', onlyCaptions: '只添加字幕' };
  const excluded = Object.entries(task.intent.requirements).filter(([key, value]) => value === 'excluded' && key !== 'onlyCaptions').map(([key]) => requirementNames[key] ?? key);
  const required = Object.entries(task.intent.requirements).filter(([, value]) => value === 'required').map(([key]) => requirementNames[key] ?? key);
  const lines = [
    ...(current ? [
      `请先执行当前这一步：${current.title}。`, operation(current),
      !current.skillId || !current.skillName
        ? '这一步需要先准备真实材料。请向我索取下面缺少的文件或信息，收到后再继续，不要虚构数据或成果。'
        : (capability(current)?.capabilityKind ?? current.capabilityKind) === 'connector'
          ? `请使用已连接的服务完成这一步（${capabilityLabel(current)}）；先确认当前账号已经连接，并按原始需求操作。`
          : `请调用${capabilityLabel(current)}，先读取该 Skill 的说明，再按本任务的要求执行这一步。`,
      '完成当前步骤后，按下方剩余流程继续，给出实际成果文件或可核对的结果。',
    ] : ['这个任务的所有步骤都已完成。请保留已有成果，不要重新制作，也不要再次执行已经完成或跳过的步骤；如需要修改，请先向我确认新的具体要求。']),
    '', `最终目标：${task.title}`, `用户原始需求：\n${task.originalInput}`,
    ...(task.inputs.length > 1 ? ['', `后续补充：\n${task.inputs.slice(1).join('\n')}`] : []),
    ...(parameters.length ? ['', `要求：${parameters.map(([key, value]) => `${({ duration: '时长', resolution: '尺寸', orientation: '方向', images: '图片数量', quantity: '数量', format: '输出格式' } as Record<string, string>)[key] ?? key}：${value}`).join('；')}`] : []),
    ...(required.length ? ['', `需要做到：${required.join('、')}`] : []),
    ...(task.intent.existingMaterials.length ? ['', `已有内容：${task.intent.existingMaterials.join('、')}`] : []),
    ...(task.intent.hasExistingOutput ? ['', '已有成果：已经有成品或已完成制作，请使用已有成果继续处理，不要从零重做。'] : []),
    ...(task.intent.missingMaterials.length ? ['', `还需准备：${task.intent.missingMaterials.join('、')}。请先向我索取实际材料，不要虚构资料或假设已连接云端账号。`] : []),
    ...(excluded.length ? ['', `明确不要：${excluded.join('、')}`] : []),
    ...(completed.length ? ['', `已经完成：${completed.map((step) => step.title).join('、')}。保留这些成果，不要重复执行。`] : []),
    ...(skipped.length ? ['', `已经跳过：${skipped.map((step) => step.title).join('、')}。不要擅自补做这些步骤。`] : []),
    ...(pending.length ? ['', '剩余流程（第一项就是当前步骤）：',
      ...pending.map((step, index) => `${index + 1}. ${step.title}${step.optional ? '（可选，按需要执行）' : ''}\n   执行要求：${operation(step)}\n   调用能力：${capabilityLabel(step)}`),
    ] : []),
    '', '开始执行前，请确认当前环境中确实存在上述 Skill 或已连接的服务；能力缺失时告诉我缺少哪个插件或 Skill，不要声称已经调用。素材文件、字幕文本、数据或设计链接未实际提供时，请先向我索取；不要把描述中的“已有”当作已经收到文件。',
  ];
  return lines.join('\n');
}
