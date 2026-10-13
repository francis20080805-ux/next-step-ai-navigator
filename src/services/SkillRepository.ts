import type { Skill } from '../domain/types.ts';
export function mergeSkills(...lists: Skill[][]): Skill[] {
  const skills = new Map<string, Skill>();
  for (const list of lists) for (const skill of list) {
    const previous = skills.get(skill.id);
    if (previous?.sourceType === 'system' && skill.sourceType === 'system') {
      const earlier = previous.version.match(/^catalog-(\d+)$/)?.[1], incoming = skill.version.match(/^catalog-(\d+)$/)?.[1];
      if (earlier && incoming && Number(earlier) > Number(incoming)) continue;
    }
    if (previous?.interpretationStatus === 'ready' && skill.interpretationStatus !== 'ready' && previous.contentHash && previous.contentHash === skill.contentHash) {
      skills.set(skill.id, { ...previous, maintenanceStatus: skill.maintenanceStatus, updatedAt: skill.updatedAt, ...(skill.githubStars !== undefined ? { githubStars: skill.githubStars } : {}) });
    } else skills.set(skill.id, skill);
  }
  return [...skills.values()];
}
