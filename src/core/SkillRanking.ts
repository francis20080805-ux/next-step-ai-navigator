import type { Skill, TaskCategory } from '../domain/types.ts';
import { seedSkills } from '../data/seedSkills.ts';
import { searchSkills } from './SearchEngine.ts';

export type RankingMode = 'recommended' | 'stars';
export interface RankedSkill {
  skill: Skill; rank: number; score: number; reason: string;
  stars: number | null; repo: string | null;
}

const nameKey = (name: string): string => name.normalize('NFKC').trim().toLowerCase();
const curatedNames = new Set(seedSkills.filter((skill) => skill.capabilityKind === 'skill').map((skill) => nameKey(skill.name)));
const commonNames = new Set([
  'Spreadsheets', 'documents', 'Presentations', 'pdf', 'imagegen', 'remotion-create',
  'remotion-captions', 'remotion-multimedia', 'remotion-render', 'frontend-app-builder',
  'frontend-testing-debugging', 'figma-design-to-code', 'figma-generate-diagram', 'visualize',
].map(nameKey));
const purposes: Partial<Record<TaskCategory, string>> = {
  spreadsheet: '日常表格与数据任务', document: '日常文档任务', presentation: '日常 PPT 任务',
  pdf: '常见 PDF 处理', image: '常见图片制作', video: '常见视频制作',
  website: '常见网页制作与检查', design: '常见设计任务',
};

function repository(skill: Skill): string | null {
  if (skill.sourceType !== 'github') return null;
  try {
    const url = new URL(skill.githubUrl);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && url.hostname === 'github.com'
      && !url.username && !url.password && !url.port && parts.length >= 2
      ? `${parts[0]}/${parts[1].replace(/\.git$/, '')}` : null;
  } catch { return null; }
}

function entry(skill: Skill, now: number): RankedSkill {
  const repo = repository(skill);
  const stars = repo && Number.isSafeInteger(skill.githubStars) && skill.githubStars! >= 0 ? skill.githubStars! : null;
  const key = nameKey(skill.name);
  const curated = curatedNames.has(key);
  const common = commonNames.has(key);
  const age = (now - Date.parse(skill.updatedAt)) / 86_400_000;
  const maintenance = skill.maintenanceStatus === 'stale' ? -15 : 10;
  const freshness = age >= 0 && age <= 90 ? 5 : age > 365 ? -5 : 0;
  // These are editorial recommendation weights, never user counts or Skill-specific stars.
  const heat = stars === null ? 0 : Math.min(20, Math.log10(stars + 1) * 4);
  const score = Math.round(((curated ? 60 : 20) + (common ? 20 : 0) + maintenance + freshness + heat) * 10) / 10;
  const reason = [
    common ? purposes[skill.taskTypes[0]] ?? '常见任务适用' : curated ? '已整理的常用能力' : '用途已完成中文整理',
    skill.maintenanceStatus === 'stale' ? '维护较久未更新' : age > 365 ? '文档较久未更新' : '维护状态正常',
    stars === null ? null : '仓库热度已核实',
  ].filter(Boolean).join(' · ');
  return { skill, rank: 0, score, reason, stars, repo };
}

function stableOrder(a: RankedSkill, b: RankedSkill): number {
  const first = `${nameKey(a.skill.name)}\u0000${a.skill.id}`;
  const second = `${nameKey(b.skill.name)}\u0000${b.skill.id}`;
  return first < second ? -1 : first > second ? 1 : 0;
}

/** A catalog recommendation list; popularity measures the source repository, not Skill usage. */
export function rankSkills(catalog: Skill[], options: {
  mode?: RankingMode; category?: TaskCategory | 'all'; query?: string; limit?: number; now?: Date;
} = {}): RankedSkill[] {
  const mode = options.mode ?? 'recommended';
  const candidates = searchSkills(options.query ?? '', catalog.filter((skill) =>
    skill.capabilityKind === 'skill' && skill.interpretationStatus === 'ready'
    && (skill.maintenanceStatus === 'active' || skill.maintenanceStatus === 'stale')
    && skill.name.trim().length > 0,
  ), options.category === 'all' ? undefined : options.category);
  const now = (options.now ?? new Date()).getTime();
  const unique = new Map<string, RankedSkill>();
  for (const skill of candidates) {
    const next = entry(skill, now);
    if (mode === 'stars' && next.stars === null) continue;
    const key = nameKey(skill.name);
    const previous = unique.get(key);
    if (!previous) { unique.set(key, next); continue; }
    // Prefer the local plain-language summary unless another source is actively maintained.
    const preference = mode === 'recommended'
      ? Number(previous.skill.maintenanceStatus === 'active') - Number(skill.maintenanceStatus === 'active')
        || Number(previous.skill.sourceType === 'system') - Number(skill.sourceType === 'system')
      : 0;
    const difference = mode === 'stars' ? previous.stars! - next.stars! : previous.score - next.score;
    const comparison = preference || difference || stableOrder(next, previous);
    if (comparison < 0) unique.set(key, next);
  }
  const result = Array.from(unique.values()).sort((a, b) =>
    (mode === 'stars' ? b.stars! - a.stars! : b.score - a.score) || stableOrder(a, b),
  );
  const limit = options.limit === undefined || !Number.isFinite(options.limit) ? 20 : Math.max(0, Math.floor(options.limit));
  return result.slice(0, limit).map((item, index) => ({ ...item, rank: index + 1 }));
}
