import { parse } from 'yaml';
import type { Skill, SkillStage, TaskCategory } from '../domain/types.ts';
import { seedSkills } from '../data/seedSkills.ts';

const stages: SkillStage[] = ['prepare', 'design', 'create', 'edit', 'check', 'error', 'export', 'publish'];
const categories: [TaskCategory, RegExp, string, string][] = [
  ['pdf', /\bpdf\b|PDF/, '处理 PDF', '帮助读取、整理或制作 PDF。'],
  ['video', /remotion|caption|subtitle|\bvideo\b|视频|字幕/i, '视频', '帮助制作或处理视频内容。'],
  ['spreadsheet', /spreadsheet|\bexcel\b|\bxlsx\b|budget|表格|库存|预算/i, '做表格', '帮助整理表格和数据。'],
  ['presentation', /presentation|powerpoint|\bpptx?\b|slides|演示文稿|幻灯片/i, '做 PPT', '帮助制作或整理演示文稿。'],
  ['website', /frontend|react|next\.?js|website|web app|\bhtml\b|shadcn|stripe|supabase|postgres|网页|网站/i, '做网页', '帮助制作、检查或调整网页。'],
  ['image', /image|photo|illustrat|raster|bitmap|图片|照片|插画/i, '图片', '帮助制作或修改图片。'],
  ['document', /\bdocx\b|\bword\b|document|文档|报告/i, '写文档', '帮助编写或整理文档。'],
  ['calendar', /calendar|schedule|日程|日历/i, '安排日程', '帮助整理时间和日程安排。'],
  ['email', /gmail|\bemail\b|邮件/i, '发邮件', '帮助准备或整理邮件内容。'],
  ['design', /figma|design system|设计稿|设计系统|组件库/i, '设计', '帮助制作或整理设计内容。'],
  ['research', /research|search|研究|查找资料/i, '查资料', '帮助查找和整理资料。'],
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 100) : typeof value === 'string' ? value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) : [];
}

function hashText(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function interpretSkillMarkdown(markdown: string, filename = 'SKILL.md'): Skill {
  if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('文件是空的，请选择包含能力说明的文件。');
  if (markdown.length > 2_000_000) throw new Error('文件过大，请选择不超过 2 MB 的说明文件。');
  const frontmatter = markdown.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  let metadata: Record<string, unknown> = {};
  if (frontmatter) {
    const parsed: unknown = parse(frontmatter[1], { maxAliasCount: 50 });
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('文件开头的说明字段格式不正确。');
    metadata = parsed as Record<string, unknown>;
  }
  const pathParts = filename.replace(/\\/g, '/').split('/').filter(Boolean);
  const leaf = pathParts.at(-1) ?? 'SKILL.md';
  const inferredName = /^skill\.md$/i.test(leaf) ? pathParts.at(-2) : leaf.replace(/\.md$/i, '');
  const named = typeof metadata.name === 'string' ? metadata.name.trim() : inferredName;
  const name = named && named.length <= 128 && !/[\r\n\u0000]/.test(named) ? named : `imported-skill-${hashText(markdown)}`;
  const body = frontmatter ? markdown.slice(frontmatter[0].length) : markdown;
  const firstParagraph = body.split(/\r?\n\s*\r?\n/).find((paragraph) => paragraph.trim() && !/^\s*(?:#|```)/.test(paragraph)) ?? '';
  const description = typeof metadata.description === 'string' ? metadata.description.trim() : firstParagraph.trim().slice(0, 1500);
  const known = seedSkills.find((skill) => skill.capabilityKind === 'skill' && (skill.name.toLowerCase() === name.toLowerCase() || skill.id.toLowerCase() === name.toLowerCase()));
  const inferred = categories.find(([, pattern]) => pattern.test(`${name} ${description}`));
  const explicitChinese = typeof metadata.chineseName === 'string' ? metadata.chineseName.trim() : '';
  const explicitSimple = typeof metadata.simpleDescription === 'string' ? metadata.simpleDescription.trim() : '';
  // A topic match does not mean arbitrary English instructions have been understood.
  const ready = Boolean(known || explicitChinese && explicitSimple && /[\u4e00-\u9fff]/.test(explicitChinese + explicitSimple));
  const validTaskTypes: TaskCategory[] = ['video', 'spreadsheet', 'presentation', 'website', 'image', 'pdf', 'document', 'email', 'calendar', 'research', 'design', 'other'];
  const declaredTypes = strings(metadata.taskTypes).filter((type): type is TaskCategory => validTaskTypes.includes(type as TaskCategory));
  const category = typeof metadata.category === 'string' && metadata.category.trim() ? metadata.category.trim().slice(0, 80) : known?.category ?? inferred?.[2] ?? '其他';
  const taskTypes: TaskCategory[] = declaredTypes.length ? declaredTypes : known?.taskTypes ?? (inferred ? [inferred[0]] : ['other']);
  const stage = typeof metadata.stage === 'string' && stages.includes(metadata.stage as SkillStage) ? metadata.stage as SkillStage : known?.stage ?? (/render|export|导出/i.test(name) ? 'export' : /test|debug|check|检查/i.test(name) ? 'check' : 'create');
  const pluginId = typeof metadata.pluginId === 'string' ? metadata.pluginId : known?.pluginId ?? '';
  return {
    id: `import:${name}:${hashText(filename)}`, name, pluginId,
    chineseName: explicitChinese || known?.chineseName || '等待确认的新能力',
    simpleDescription: explicitSimple || known?.simpleDescription || '说明已读入，中文用途还需要确认。',
    description, skillMarkdown: markdown, category, tags: strings(metadata.tags).length ? strings(metadata.tags) : known?.tags ?? [category],
    userPhrases: strings(metadata.userPhrases).length ? strings(metadata.userPhrases) : known?.userPhrases ?? [],
    taskTypes, stage, required: metadata.required === true, conditions: strings(metadata.conditions).length ? strings(metadata.conditions) : known?.conditions ?? [],
    excludeConditions: strings(metadata.excludeConditions), prerequisites: strings(metadata.prerequisites), nextSkills: strings(metadata.nextSkills),
    githubUrl: '', sourceType: 'import', version: typeof metadata.version === 'string' || typeof metadata.version === 'number' ? String(metadata.version) : '',
    updatedAt: new Date().toISOString(), maintenanceStatus: 'active', capabilityKind: 'skill',
    sourcePath: filename, contentHash: `fnv1a:${hashText(markdown)}`, interpretationStatus: ready ? 'ready' : 'pending',
  };
}
