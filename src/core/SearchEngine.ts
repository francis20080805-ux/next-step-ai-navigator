import type { Skill } from '../domain/types.ts';

const aliases: [RegExp, string[]][] = [
  [/剪视频|短视频|视频制作/, ['视频', 'remotion']],
  [/字幕|口播字幕|自动字幕/, ['字幕', 'captions']],
  [/销售|库存|预算|收支|记账|Excel|统计表/i, ['表格', 'Spreadsheets']],
  [/PPT|演示文稿|幻灯片/i, ['PPT', 'presentation', 'slides']],
  [/Figma.*网页|设计图.*网页|设计稿.*网页/i, ['figma-design-to-code']],
  [/按钮.*坏|按钮.*不了|错位|打不开|网页.*报错/, ['frontend-testing-debugging', '检查网页问题']],
  [/PDF.*表格|PDF.*提取/i, ['pdf', 'Spreadsheets']],
  [/网页.*慢|网页.*卡|加载慢/, ['react-best-practices']],
];

export function searchSkills(query: string, catalog: Skill[], category?: string): Skill[] {
  const raw = query.trim().toLowerCase();
  const terms = [raw, ...aliases.filter(([pattern]) => pattern.test(query)).flatMap(([, words]) => words.map((word) => word.toLowerCase()))].filter(Boolean);
  const filtered = catalog.filter((skill) => !category || category === '全部' || skill.category === category || skill.taskTypes.includes(category as never));
  if (!raw) return filtered;
  return filtered.map((skill) => {
    const names = `${skill.name} ${skill.chineseName}`.toLowerCase();
    const text = `${names} ${skill.simpleDescription} ${skill.description} ${skill.category} ${skill.tags.join(' ')} ${skill.userPhrases.join(' ')}`.toLowerCase();
    const score = terms.reduce((n, term) => n + (names.includes(term) ? 8 : text.includes(term) ? 3 : 0), 0)
      + raw.split(/\s+/).filter((word) => word.length > 1 && text.includes(word)).length;
    return { skill, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.skill.chineseName.localeCompare(b.skill.chineseName, 'zh-CN')).map((item) => item.skill);
}
