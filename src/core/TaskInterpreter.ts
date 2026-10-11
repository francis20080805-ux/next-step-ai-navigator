import type { InterpretationResult, Requirement, Skill, TaskCategory, TaskIntent, TaskRecord } from '../domain/types.ts';
import { seedSkills } from '../data/seedSkills.ts';
import { planWorkflow } from './WorkflowPlanner.ts';

const categoryLabels: Record<TaskCategory, string> = {
  video: '制作视频', spreadsheet: '制作表格', presentation: '制作 PPT', website: '制作网页', image: '制作图片',
  pdf: '处理 PDF', document: '编写文档', email: '发送邮件', calendar: '安排日程', research: '查找资料', design: '制作设计稿', other: '完成任务',
};

function targetText(input: string): string {
  const clauses = input.split(/[，,。；;\n]/).filter(Boolean);
  return clauses.map((clause) => {
    if (/(?:已有|已经有|我有|现有|做好了|做完了|完成了)/.test(clause)) {
      const desired = clause.match(/(?:只想|只需要|只需|想要|想|(?:需要|要)(?=做|剪|加|处理|导出|分析|统计|变成|转|制作))(.+)$/);
      if (desired) return desired[1];
      if (!/错位|打不开|点不了|报错|坏了|异常|慢|卡顿/.test(clause)) return '';
    }
    return clause;
  }).join('，') || input;
}

function detectCategory(input: string, target: string): TaskCategory {
  if (/(?:转|导出|变成|做成).{0,8}PDF/i.test(target)) return 'pdf';
  if (/PDF.{0,10}(?:提取|转|做成).{0,8}(?:表格|Excel)/i.test(target)) return 'spreadsheet';
  if (/网页|网站|建站|Web\s*App|APP|应用|按钮|网页.*错位|手机.*错位|网页.*卡顿/i.test(target)) return 'website';
  if (/PPT|演示文稿|幻灯片/i.test(target)) return 'presentation';
  if (/邮件|邮箱|发信/i.test(target)) return 'email';
  if (/日程|会议|安排时间|提醒|日历/.test(target)) return 'calendar';
  if (/视频|短片|剪辑|字幕|口播|配乐/.test(target)) return 'video';
  if (/表格|库存|预算|收支|记账|排班|数据分析|分析数据|销售统计|Excel|xlsx|csv|做图表/i.test(target)) return 'spreadsheet';
  if (/PDF/i.test(target)) return 'pdf';
  if (/文档|报告|合同|Word|docx|文章|翻译/i.test(target)) return 'document';
  if (/Figma|设计稿|设计文件|组件库|流程图|架构图/i.test(target)) return 'design';
  if (/图片|图像|照片|海报|插画|抠图|去背景|logo|做图/i.test(target)) return 'image';
  if (/查资料|调研|查找|搜资料|搜索|研究|GitHub/i.test(target)) return 'research';
  if (target !== input) return detectCategory(input, input);
  return 'other';
}

function requirement(input: string, feature: RegExp): Requirement {
  let result: Requirement = 'unspecified';
  for (const clause of input.split(/[，,。；;\n]/)) {
    const matches = [...clause.matchAll(new RegExp(feature.source, `${feature.flags.replace('g', '')}g`))];
    for (const match of matches) {
      const prefix = clause.slice(0, match.index);
      const directives = [...prefix.matchAll(/不要|不需要|不想要|无需|不用|不加|不做|别|需要|想要|添加|加上|加|配上|配|要/g)];
      const last = directives.at(-1)?.[0];
      const suffix = clause.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 8);
      if (last && /^(?:不|无|别)/.test(last) || /^(?:暂时)?(?:不要|不需要|不用|无需)/.test(suffix)) result = 'excluded';
      else result = 'required';
    }
  }
  return result;
}

function subtypeFor(input: string, category: TaskCategory, prior?: string): string {
  if (category === 'video') {
    if (/宣传|产品/.test(input)) return '产品宣传视频';
    if (/口播/.test(input)) return '口播视频';
    if (/教学|教程/.test(input)) return '教学视频';
    if (/图文/.test(input)) return '图文视频';
    if (/剪/.test(input)) return '剪辑';
    if (/字幕/.test(input)) return '字幕视频';
    if (/短视频|短片/.test(input)) return '短视频';
  }
  if (category === 'spreadsheet') {
    if (/库存/.test(input)) return '库存表';
    if (/预算/.test(input)) return '预算表';
    if (/收支/.test(input)) return '收支表';
    if (/销售/.test(input)) return '销售表';
    if (/记账/.test(input)) return '记账表';
    if (/排班/.test(input)) return '员工排班表';
    if (/项目|进度/.test(input)) return '项目进度表';
    if (/客户/.test(input)) return '客户名单';
    if (/统计|分析/.test(input)) return '数据统计';
  }
  if (category === 'presentation' && /销售|数据/.test(input)) return '销售汇报';
  if (category === 'design' && /流程图|架构图/.test(input)) return '流程图';
  if (category === 'research' && /GitHub/i.test(input)) return 'GitHub';
  return prior ?? '';
}

const completionRules: [string, RegExp][] = [
  ['video.create', /(?:视频|短片).{0,10}(?:已经|已)?(?:做好|做完|完成)|(?:已经|已)(?:有|做好|完成).{0,5}(?:视频|短片)/],
  ['video.captions', /(?:字幕).{0,5}(?:已经|已)?(?:加好了|做好|做完|完成)|(?:已经|已)加.{0,5}字幕/],
  ['video.export', /(?:已经|已)导出|导出(?:好了|完成)/],
  ['website.create', /(?:网页|网站).{0,8}(?:已经|已)?(?:做好|做完|完成|上线)/],
  ['presentation.create', /(?:PPT|演示文稿).{0,8}(?:已经|已)?(?:做好|做完|完成)/i],
  ['data.organize', /数据.{0,6}整理(?:好|完|完成)|整理数据.{0,5}完成/],
  ['data.charts', /图表.{0,6}(?:做好|完成)|(?:已经|已)(?:有|做好).{0,5}图表/],
];

function positiveMatch(pattern: RegExp, input: string): boolean {
  return input.split(/[，,。；;\n]/).some((clause) => {
    const matches = [...clause.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))];
    return matches.some((match) => {
      const after = clause.slice((match.index ?? 0) + match[0].length, (match.index ?? 0) + match[0].length + 3);
      return !/没|未|不|尚未|要做|要制作|想(?:做|要)|准备(?:做|制作)/.test(match[0]) && !/^(?:后|以后|之前|前|吗|了[吗?？])/.test(after);
    });
  });
}

function shortTitle(input: string, intent: TaskIntent): string {
  if (intent.category === 'video') {
    if (/(?:已有|已经有|视频已|视频已经|我有.{0,5}视频|给视频|为视频)/.test(input) && intent.requirements.captions === 'required') return '给已有视频加字幕';
    if (intent.subtype === '产品宣传视频') return '制作产品宣传视频';
    if (intent.subtype === '口播视频') return '制作口播视频';
    if (intent.subtype === '教学视频') return '制作教学视频';
    if (intent.subtype === '图文视频') return '制作图文视频';
    if (intent.requirements.captions === 'required') return '制作带字幕的视频';
    return intent.subtype === '剪辑' ? '剪辑短视频' : '制作短视频';
  }
  if (intent.category === 'presentation') return intent.subtype === '销售汇报' || intent.goals.some((goal) => /销售|数据/.test(goal)) ? '用销售数据制作 PPT' : '制作 PPT';
  if (intent.category === 'spreadsheet') return intent.subtype ? `制作${intent.subtype}` : '整理数据和制作表格';
  if (intent.category === 'website') return intent.hasError ? '修复网页问题' : intent.hasDesign ? '把设计图做成网页' : '制作网页或应用';
  if (intent.category === 'image') return intent.hasExistingOutput ? '修改已有图片' : '制作图片';
  if (intent.category === 'email') return '起草和发送邮件';
  if (intent.category === 'research') return '查找和整理资料';
  return categoryLabels[intent.category];
}

export function planWorkflowFromIntent(input: string, intent: TaskIntent, previous?: TaskRecord, catalog: Skill[] = seedSkills): TaskRecord {
  const now = new Date().toISOString();
  if (previous) {
    const requirements = { ...previous.intent.requirements };
    for (const [key, value] of Object.entries(intent.requirements)) if (value !== 'unspecified' || !requirements[key]) requirements[key] = value;
    intent = {
      ...intent, requirements,
      parameters: { ...previous.intent.parameters, ...Object.fromEntries(Object.entries(intent.parameters).filter(([, value]) => value.trim())) },
      goals: [...new Set([...previous.intent.goals, ...intent.goals])],
      existingMaterials: [...new Set([...previous.intent.existingMaterials, ...intent.existingMaterials])],
      completedActions: [...new Set([...previous.intent.completedActions, ...intent.completedActions])],
    };
  }
  if (previous && intent.category === 'video' && previous.steps.some((step) => step.action === 'video.create' || step.action === 'video.materials') && positiveMatch(/(?:视频|短片).{0,10}(?:已经|已)?(?:做好|做完|完成)|(?:已经|已)(?:做好|完成).{0,5}(?:视频|短片)/, input)) {
    const materialEdit = input.split(/[，,。；;\n]/).some((clause) => [...clause.matchAll(/(?:加(?:上)?|添加|更换|替换|换|调整|修改|删|裁剪).{0,10}(?:音乐|配乐|BGM|背景音|素材|图片|照片|顺序|节奏|视频|片段|画面)|重新剪辑|剪辑|剪视频/gi)].some((match) => {
      const prefix = clause.slice(0, match.index);
      const suffix = clause.slice((match.index ?? 0) + match[0].length);
      return !/(?:不要|不需要|不用|无需|别|不)(?:再|继续)?\s*$/.test(prefix) && !/^(?:已经|已)?(?:完成|做好|做完|好了)/.test(suffix);
    }));
    const completedActions = new Set(intent.completedActions);
    completedActions.add('video.create');
    if (materialEdit) {
      completedActions.delete('video.materials');
      previous = { ...previous, steps: previous.steps.map((step) => step.action === 'video.materials' ? { ...step, status: 'pending' } : step) };
      intent = { ...intent, subtype: '剪辑', requirements: { ...intent.requirements, onlyCaptions: 'excluded' } };
    } else if (previous.steps.some((step) => step.action === 'video.materials')) completedActions.add('video.materials');
    intent = { ...intent, hasExistingOutput: true, completedActions: [...completedActions] };
  }
  const steps = planWorkflow(intent, catalog, previous);
  if (!steps.length) throw new Error('暂时还无法拆解这个任务，请补充最后想得到什么。');
  const previousTitle = previous?.title && previous.title !== previous.originalInput && previous.title.length <= 24 ? previous.title : undefined;
  return {
    id: previous?.id ?? crypto.randomUUID(), title: previousTitle ?? shortTitle(previous?.originalInput ?? input, intent),
    originalInput: previous?.originalInput ?? input.trim(), inputs: [...(previous?.inputs ?? []), input.trim()],
    intent, steps, createdAt: previous?.createdAt ?? now, updatedAt: now,
    status: steps.length && steps.every((step) => step.status !== 'pending') ? 'completed' : previous?.status === 'started' || previous?.status === 'completed' ? 'started' : 'planned',
    mode: previous?.mode ?? 'local', favorite: previous?.favorite ?? false,
  };
}

export function interpretLocal(input: string, previous?: TaskRecord, catalog: Skill[] = seedSkills): InterpretationResult {
  input = input.trim();
  if (!input) throw new Error('先告诉我，你想让 AI 帮你做什么。');
  const target = targetText(input);
  const detected = detectCategory(input, target);
  const category = detected === 'other' && previous ? previous.intent.category : detected;
  const subtype = subtypeFor(input, category, previous?.intent.subtype);
  if (!previous && category === 'video' && !subtype && !/\d+\s*(?:秒|分钟)|字幕|音乐|图片|已经|已有|做好|做完|剪/.test(input)) {
    return { kind: 'clarification', clarification: { question: '你想做哪一种视频？', options: ['短视频', '产品宣传视频', '口播视频', '图文视频', '字幕视频', '教学视频', '其他'], originalInput: input } };
  }
  if (!previous && category === 'spreadsheet' && !subtype && !/数据|Excel|xlsx|csv|图表/i.test(input)) {
    return { kind: 'clarification', clarification: { question: '你想做哪一种表格？', options: ['记账表', '销售表', '库存表', '员工排班', '项目进度', '预算表', '数据统计', '客户名单', '其他'], originalInput: input } };
  }
  if (category === 'other') return { kind: 'clarification', clarification: { question: '你最后想得到什么？请补充一个具体结果。', options: ['视频或图片', '表格或 PPT', '网页或文档'], originalInput: input } };

  const requirements: Record<string, Requirement> = { ...previous?.intent.requirements };
  const features: [string, RegExp][] = [
    ['captions', /字幕|captions|srt/i], ['music', /音乐|配乐|BGM|背景音/i], ['charts', /图表|柱状图|折线图|饼图/],
    ['dashboard', /看板|仪表盘/], ['payment', /支付|收款|Stripe|订阅收费/i], ['components', /shadcn|组件库|设计系统/i],
    ['optimize', /性能|优化|加载慢|卡顿|运行慢|网站慢|速度/], ['database', /数据库|Supabase|Postgres/i],
    ['publish', /发布|上线|部署/], ['check', /检查|测试|验证/], ['export', /导出|输出/],
  ];
  for (const [key, feature] of features) {
    const value = requirement(input, feature);
    requirements[key] = value === 'unspecified' ? requirements[key] ?? 'unspecified' : value;
  }
  if (/只(?:想|需|需要|要).{0,5}(?:加|添加)?.{0,2}字幕/.test(input)) requirements.onlyCaptions = 'required';
  else if (/音乐|配乐|剪辑|素材/.test(target)) requirements.onlyCaptions = 'excluded';

  const fixedError = /(?:问题|网页|网站|按钮).{0,10}(?:修好了|已修好|已经修好|恢复正常)|(?:已经|已)修好/.test(input);
  const hasError = !fixedError && (/错位|点不了|打不开|报错|坏了|显示异常|不正常/.test(input) || Boolean(previous?.intent.hasError));
  const outputPatterns: Partial<Record<TaskCategory, RegExp>> = {
    video: /(?:我有|已有|已经有|现有).{0,8}(?:视频|短片)|(?:视频|短片).{0,10}(?:做好|做完|完成)|(?:给|为).{0,8}视频.{0,5}(?:加|添加|配|修改)/,
    website: /(?:我有|已有|已经有|现有).{0,8}(?:网页|网站)|(?:网页|网站).{0,10}(?:做好|做完|完成|上线|修好)/,
    presentation: /(?:我有|已有|已经有|现有).{0,40}(?:PPT|演示|模板)|(?:PPT|演示).{0,10}(?:做好|做完|完成)/i,
    spreadsheet: /(?:我有|已有|现有|已经有).{0,30}(?:表格|工作簿|Excel)/i,
    image: /(?:我有|已有|现有|已经有).{0,10}(?:图片|照片|图像)|(?:修改|处理|抠图|去背景).{0,8}(?:图片|照片|图像)/,
    document: /(?:我有|已有|现有|已经有).{0,8}(?:文档|报告|Word)/i,
    design: /(?:我有|已有|現有|现有|已经有).{0,10}(?:设计|Figma)/i,
  };
  const hasExistingOutput = Boolean(previous?.intent.hasExistingOutput || !/从零|从头|重新制作/.test(input) && outputPatterns[category] && positiveMatch(outputPatterns[category]!, input) || category === 'website' && (hasError || requirements.optimize === 'required'));
  const hasDesign = Boolean(previous?.intent.hasDesign || positiveMatch(/(?:我有|已有|现有|已经有).{0,12}(?:Figma|设计稿|设计图)/i, input) || /(?:Figma|设计图|设计稿).{0,15}(?:做成|变成|转).{0,8}网页/i.test(input));
  const useCloud = Boolean(previous?.intent.useCloud || /Google\s*(?:Drive|Sheets|Docs|Slides)|谷歌|云盘|云端|在线表格|在线文档/i.test(input));
  const materials = new Set(previous?.intent.existingMaterials ?? []);
  if (hasDesign) materials.add('已有设计稿');
  if (category === 'video' && hasExistingOutput) materials.add('已有视频');
  if (positiveMatch(/(?:有|用|提供|\d+张).{0,12}(?:图片|产品图|照片)|\d+\s*张.{0,5}(?:图|照片)/, input)) materials.add('产品图片或照片');
  if (positiveMatch(/(?:我有|已有|现有|提供).{0,10}(?:文案|脚本)/, input)) materials.add('已有文案');
  if (positiveMatch(/(?:我有|已有|现有|已经有|提供|上传).{0,18}(?:数据|CSV|xlsx)|数据.{0,5}(?:整理好|已准备|准备好了)/i, input)) materials.add('已有数据');
  if (positiveMatch(/(?:我有|已有|现有|已经有).{0,20}图表/, input)) materials.add('已有图表');
  if (positiveMatch(/已有.{0,40}模板|现有.{0,40}模板/, input)) materials.add(useCloud ? '已有 Google Slides 模板' : '已有演示模板');
  if (useCloud && /Google Slides/i.test(input)) materials.add('Google Slides');
  const missing = new Set(previous?.intent.missingMaterials ?? []);
  if (category === 'presentation' && /销售|数据/.test(`${input} ${subtype}`) && ![...materials].some((material) => /数据/.test(material))) missing.add(/上个月|上月/.test(input) ? '上个月销售数据' : '销售数据');
  if ([...materials].some((material) => /数据/.test(material))) for (const item of missing) if (/数据/.test(item)) missing.delete(item);
  const completedActions = new Set(previous?.intent.completedActions ?? []);
  if (fixedError) completedActions.add('website.debug');
  for (const [action, pattern] of completionRules) if (positiveMatch(pattern, input)) completedActions.add(action);
  if ([...materials].some((material) => /数据/.test(material))) completedActions.add('data.prepare');
  if (materials.has('已有图表')) completedActions.add('data.charts');
  if (/整理好(?:了|的)?.{0,8}数据|数据.{0,8}整理好/.test(input)) completedActions.add('data.organize');
  const parameters = { ...previous?.intent.parameters };
  const duration = input.match(/(\d+)\s*(秒|分钟)/);
  const resolution = input.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/i);
  const images = input.match(/(\d+)\s*张.{0,5}(?:图|照片)/);
  if (duration) parameters.duration = `${duration[1]}${duration[2]}`;
  if (resolution) parameters.resolution = `${resolution[1]}×${resolution[2]}`;
  if (images) parameters.quantity = `${images[1]}张图片`;
  if (/竖屏/.test(input)) parameters.orientation = '竖屏';
  if (/横屏/.test(input)) parameters.orientation = '横屏';
  const goals = new Set(previous?.intent.goals ?? [categoryLabels[category]]);
  if (/(?:做|制作|生成).{0,15}(?:统计表|销售表|库存表|预算表|表格)/.test(target)) goals.add('制作表格');
  if (/PPT|演示文稿/i.test(target)) goals.add('制作 PPT');
  if (category === 'presentation' && subtype === '销售汇报') goals.add('销售数据汇报');
  if (/PDF.{0,15}(?:表格|Excel)|(?:表格|Excel).{0,15}PDF/i.test(input)) goals.add('处理 PDF');
  const intent: TaskIntent = {
    category, goals: [...goals], existingMaterials: [...materials], missingMaterials: [...missing],
    completedActions: [...completedActions], requirements, parameters, subtype, hasExistingOutput, hasDesign, hasError, useCloud,
  };
  const task = planWorkflowFromIntent(input, intent, previous, catalog);
  task.mode = 'local';
  return { kind: 'task', task, notice: task.steps.some((step) => step.skillId === null && step.action !== 'data.prepare') ? '有一步还没有找到可用的能力，可以先补充说明或添加相关能力。' : undefined };
}
