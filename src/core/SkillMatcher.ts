import type { Skill, TaskIntent } from '../domain/types.ts';

const preferred: Record<string, string[]> = {
  'video.create': ['remotion-create'], 'video.materials': ['remotion-markup', 'remotion-create'],
  'video.captions': ['remotion-captions'], 'video.export': ['remotion-render'],
  'spreadsheet.create': ['Spreadsheets'], 'spreadsheet.quantity': ['Spreadsheets'],
  'data.organize': ['Spreadsheets'], 'data.analyze': ['Spreadsheets'], 'data.charts': ['Spreadsheets'],
  'data.dashboard': ['spreadsheet-human-ux'], 'spreadsheet.check': ['spreadsheet-human-ux'],
  'presentation.create': ['Presentations'], 'presentation.check': ['Presentations'],
  'website.designread': ['figma-design-to-code'], 'website.create': ['frontend-app-builder'],
  'website.debug': ['frontend-testing-debugging'], 'website.check': ['frontend-testing-debugging'],
  'website.optimize': ['react-best-practices'], 'website.components': ['shadcn'],
  'website.payment': ['stripe-best-practices'], 'website.database': ['supabase-postgres-best-practices'],
  'website.publish': ['sites'], 'image.create': ['imagegen'], 'image.edit': ['imagegen'],
  'pdf.edit': ['pdf'], 'document.create': ['documents'], 'document.check': ['documents'],
  'design.file': ['figma-create-new-file'], 'design.create': ['figma-generate-design'],
  'design.edit': ['figma-use'], 'design.library': ['figma-generate-library'], 'design.diagram': ['figma-generate-diagram'],
  'email.draft': ['Gmail'], 'email.send': ['Gmail'],
  'calendar.availability': ['Google Calendar'], 'calendar.create': ['Google Calendar'],
  'research.search': ['Web Search'], 'research.github': ['GitHub'],
};

const actionPhrases: Record<string, string[]> = {
  'video.create': ['做视频', '制作视频', 'video creation', 'create video'],
  'video.materials': ['视频素材', '音乐', 'multimedia'], 'video.captions': ['字幕', 'caption', 'subtitle'],
  'video.export': ['导出视频', 'render video', 'video rendering'],
  'spreadsheet.create': ['做表格', '制作表格', 'spreadsheet'],
  'data.organize': ['整理数据', 'data cleaning', 'data preparation'], 'data.analyze': ['统计分析', '数据分析', 'data analysis'],
  'data.charts': ['图表', 'chart'], 'presentation.create': ['PPT', '演示文稿', 'presentation'],
  'presentation.check': ['检查PPT', '检查演示文稿', 'presentation'],
  'website.create': ['做网页', '开发网页', 'website creation', 'frontend'],
  'website.designread': ['设计图转网页', 'design to code', 'design-to-code'],
  'website.debug': ['网页问题', 'debug'], 'website.check': ['网页测试', 'frontend test', 'debug'],
  'website.optimize': ['性能', 'performance'], 'website.database': ['数据库', 'database'],
  'image.create': ['生成图片', 'image generation'], 'image.edit': ['修改图片', 'image editing'],
  'document.create': ['文档', 'document'], 'pdf.edit': ['PDF'],
};

function conditionsMatch(skill: Skill, intent: TaskIntent): boolean {
  for (const condition of skill.conditions) {
    if (condition.startsWith('needs:') && intent.requirements[condition.slice(6)] !== 'required') return false;
    if (condition === 'has:design' && !intent.hasDesign) return false;
    if (condition === 'uses:cloud' && !intent.useCloud) return false;
  }
  for (const condition of skill.excludeConditions) {
    if (condition.startsWith('needs:') && intent.requirements[condition.slice(6)] === 'required') return false;
    if (condition === 'has:design' && intent.hasDesign) return false;
    if (condition === 'uses:cloud' && intent.useCloud) return false;
  }
  return true;
}

export function matchSkill(action: string, intent: TaskIntent, catalog: Skill[]): Skill | null {
  if (action === 'data.prepare') return null;
  if (action === 'video.captions' && intent.requirements.captions === 'excluded') return null;
  let names = preferred[action] ?? [];
  if (intent.useCloud) {
    if (/^(?:spreadsheet\.|data\.)/.test(action)) names = ['google-sheets', ...names];
    if (action.startsWith('document.')) names = ['google-docs', ...names];
    // Google Slides authoring is for an existing native template/reference, not a blank PPT.
    if (action.startsWith('presentation.') && (intent.hasExistingOutput || intent.existingMaterials.some((x) => /模板/.test(x)))) names = ['google-slides', ...names];
  }
  const eligible = catalog.filter((skill) =>
    skill.interpretationStatus === 'ready' && !['removed', 'deprecated', 'unavailable'].includes(skill.maintenanceStatus) && conditionsMatch(skill, intent));
  const exact = names.map((name) => eligible.filter((skill) => skill.name.toLowerCase() === name.toLowerCase()).sort((a, b) => Number(b.maintenanceStatus === 'active') - Number(a.maintenanceStatus === 'active'))[0]).find(Boolean);
  if (exact) return exact;
  if (!names.length) return null;
  const category = action.startsWith('data.') ? 'spreadsheet' : action.split('.')[0];
  const words = actionPhrases[action] ?? [];
  const categoryAliases: Record<string, string[]> = { video: ['视频', 'video'], spreadsheet: ['表格', '数据分析', '财务', 'spreadsheet'], website: ['网页', '网站', 'website'], presentation: ['ppt', '演示', 'presentation'], image: ['图片', 'image'], pdf: ['pdf'], document: ['文档', 'document'], design: ['设计', 'design'] };
  const ranked = eligible.filter((skill) => skill.capabilityKind === 'skill' && (skill.taskTypes.includes(category as TaskIntent['category']) || categoryAliases[category]?.some((label) => skill.category.toLowerCase().includes(label))))
    .map((skill) => ({ skill, score: words.reduce((score, word) => score + (`${skill.name} ${skill.simpleDescription} ${skill.description} ${skill.userPhrases.join(' ')}`.toLowerCase().includes(word.toLowerCase()) ? 2 : 0), 0) + (skill.maintenanceStatus === 'active' ? 1 : 0) }))
    .sort((a, b) => b.score - a.score);
  // A broad category alone cannot substitute an unrelated skill for a precise action.
  return ranked[0]?.score > 1 ? ranked[0].skill : null;
}
