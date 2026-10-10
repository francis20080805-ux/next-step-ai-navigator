import type { TaskIntent, Skill } from '../src/domain/types.ts';

export const categories = ['video', 'spreadsheet', 'presentation', 'website', 'image', 'pdf', 'document', 'email', 'calendar', 'research', 'design', 'other'] as const;
export const stages = ['prepare', 'design', 'create', 'edit', 'check', 'error', 'export', 'publish'] as const;
const chineseCategories: Record<string, string> = { video: '视频', spreadsheet: '做表格', presentation: '做 PPT', website: '做网页', image: '图片', pdf: '处理 PDF', document: '写文档', email: '发邮件', calendar: '安排日程', research: '查资料', design: '设计', other: '其他' };
export const requirementKeys = ['captions', 'music', 'charts', 'dashboard', 'export', 'responsive', 'design', 'analysis', 'onlyCaptions', 'check', 'components', 'payment', 'optimize', 'database', 'publish'];
export const actionIds = ['video.create', 'video.materials', 'video.captions', 'video.export', 'spreadsheet.create', 'data.prepare', 'data.organize', 'spreadsheet.quantity', 'data.analyze', 'data.charts', 'data.dashboard', 'spreadsheet.check', 'presentation.create', 'presentation.check', 'website.debug', 'website.designread', 'website.create', 'website.components', 'website.payment', 'website.optimize', 'website.database', 'website.check', 'website.publish', 'pdf.edit', 'image.edit', 'image.create', 'document.create', 'document.check', 'design.diagram', 'design.file', 'design.edit', 'design.create', 'design.library', 'email.draft', 'email.send', 'calendar.availability', 'calendar.create', 'research.github', 'research.search'];
const strings = { type: 'array', items: { type: 'string' }, maxItems: 24 };
export const taskIntentSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    category: { type: 'string', enum: categories }, goals: strings, existingMaterials: strings,
    missingMaterials: strings, completedActions: { type: 'array', items: { type: 'string', enum: actionIds }, maxItems: 24 },
    requirements: { type: 'object', additionalProperties: false, properties: Object.fromEntries(requirementKeys.map(key => [key, { type: 'string', enum: ['required', 'excluded', 'unspecified'] }])), required: requirementKeys },
    parameters: { type: 'object', additionalProperties: false, properties: Object.fromEntries(['duration', 'resolution', 'orientation', 'quantity', 'format'].map(key => [key, { type: 'string' }])), required: ['duration', 'resolution', 'orientation', 'quantity', 'format'] },
    subtype: { type: 'string' }, hasExistingOutput: { type: 'boolean' }, hasDesign: { type: 'boolean' }, hasError: { type: 'boolean' }, useCloud: { type: 'boolean' },
  },
  required: ['category', 'goals', 'existingMaterials', 'missingMaterials', 'completedActions', 'requirements', 'parameters', 'subtype', 'hasExistingOutput', 'hasDesign', 'hasError', 'useCloud'],
};
export const skillExplanationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    chineseName: { type: 'string' }, simpleDescription: { type: 'string' }, category: { type: 'string', enum: categories },
    tags: strings, userPhrases: strings, taskTypes: { type: 'array', items: { type: 'string', enum: categories } },
    stage: { type: 'string', enum: stages }, required: { type: 'boolean' }, conditions: strings, excludeConditions: strings, prerequisites: strings, nextSkills: strings,
  },
  required: ['chineseName', 'simpleDescription', 'category', 'tags', 'userPhrases', 'taskTypes', 'stage', 'required', 'conditions', 'excludeConditions', 'prerequisites', 'nextSkills'],
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('返回格式不是对象');
  return value as Record<string, unknown>;
}
function string(value: unknown, max = 1200): string {
  if (typeof value !== 'string' || value.length > max) throw new Error('返回文字字段不正确');
  return value;
}
function stringList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 24) throw new Error('返回列表字段不正确');
  return value.map(item => string(item));
}
export function validateTaskIntent(value: unknown): TaskIntent {
  const v = object(value);
  if (taskIntentSchema.required.some(key => !(key in v)) || Object.keys(v).some(key => !taskIntentSchema.required.includes(key))) throw new Error('任务字段不完整或包含未知字段');
  if (!categories.includes(v.category as typeof categories[number])) throw new Error('任务分类不正确');
  for (const key of ['hasExistingOutput', 'hasDesign', 'hasError', 'useCloud']) if (typeof v[key] !== 'boolean') throw new Error('任务状态不正确');
  const requirements = object(v.requirements), parameters = object(v.parameters);
  const parameterKeys = ['duration', 'resolution', 'orientation', 'quantity', 'format'];
  if (Object.keys(requirements).length !== requirementKeys.length || requirementKeys.some(key => !(key in requirements)) || Object.keys(requirements).some(key => !requirementKeys.includes(key))) throw new Error('任务条件字段不完整');
  if (Object.keys(parameters).length !== parameterKeys.length || parameterKeys.some(key => !(key in parameters)) || Object.keys(parameters).some(key => !parameterKeys.includes(key))) throw new Error('任务参数字段不完整');
  for (const requirement of Object.values(requirements)) if (!['required', 'excluded', 'unspecified'].includes(String(requirement))) throw new Error('任务条件不正确');
  for (const parameter of Object.values(parameters)) string(parameter);
  const completedActions = stringList(v.completedActions);
  if (completedActions.some(action => !actionIds.includes(action))) throw new Error('已完成步骤不正确');
  return { category: v.category as TaskIntent['category'], goals: stringList(v.goals), existingMaterials: stringList(v.existingMaterials), missingMaterials: stringList(v.missingMaterials), completedActions, requirements: requirements as TaskIntent['requirements'], parameters: parameters as Record<string, string>, subtype: string(v.subtype), hasExistingOutput: v.hasExistingOutput as boolean, hasDesign: v.hasDesign as boolean, hasError: v.hasError as boolean, useCloud: v.useCloud as boolean };
}
export function validateSkillExplanation(value: unknown, base: Skill, catalog: Skill[]): Skill {
  const v = object(value);
  if (skillExplanationSchema.required.some(key => !(key in v)) || Object.keys(v).some(key => !skillExplanationSchema.required.includes(key))) throw new Error('能力解释字段不完整或包含未知字段');
  if (!categories.includes(v.category as typeof categories[number]) || !stages.includes(v.stage as typeof stages[number]) || typeof v.required !== 'boolean') throw new Error('能力解释分类不正确');
  const taskTypes = stringList(v.taskTypes);
  if (!taskTypes.every(item => categories.includes(item as typeof categories[number]))) throw new Error('适用任务不正确');
  const ids = new Set(catalog.map(skill => skill.id));
  const prerequisites = stringList(v.prerequisites), nextSkills = stringList(v.nextSkills);
  if ([...prerequisites, ...nextSkills].some(id => !ids.has(id) || id === base.id)) throw new Error('能力关联引用了不存在的能力');
  const chineseName = string(v.chineseName, 40), simpleDescription = string(v.simpleDescription, 180);
  if (!chineseName.trim() || !simpleDescription.trim()) throw new Error('中文解释为空');
  return { ...base, chineseName, simpleDescription, category: chineseCategories[String(v.category)], tags: stringList(v.tags), userPhrases: stringList(v.userPhrases), taskTypes: taskTypes as Skill['taskTypes'], stage: v.stage as Skill['stage'], required: v.required, conditions: stringList(v.conditions), excludeConditions: stringList(v.excludeConditions), prerequisites, nextSkills, interpretationStatus: 'ready' };
}
