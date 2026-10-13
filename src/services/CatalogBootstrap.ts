import type { Skill } from '../domain/types.ts';
import { defaultData, validateBackup } from './StorageLayer.ts';
import { mergeSkills } from './SkillRepository.ts';

export async function readCatalogSnapshot(value: string, pageUrl: string, fetcher: typeof fetch = fetch, timeout = 60000): Promise<Skill[]> {
  const url = new URL(value, pageUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写有效的公共能力库网页地址。');
  const response = await fetcher(url.href, { signal: AbortSignal.timeout(timeout), ...(url.hostname === 'api.github.com' ? { headers: { Accept: 'application/vnd.github.raw+json' } } : {}) });
  if (!response.ok) throw new Error(`公共能力库暂时无法读取（${response.status}）。`);
  const rawText = await response.text();
  if (new TextEncoder().encode(rawText).byteLength > 25 * 1024 * 1024) throw new Error('公共能力库超过 25 MB，无法导入。');
  const raw: unknown = JSON.parse(rawText);
  const skills = Array.isArray(raw) ? raw : (raw as { skills?: unknown })?.skills;
  return validateBackup({ ...defaultData(), skills }).skills;
}

export function mergeCatalogCache(builtins: Skill[], bundled: Skill[], saved: Skill[]): Skill[] {
  return mergeSkills(builtins, bundled, saved);
}
