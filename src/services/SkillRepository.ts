import type { Skill } from '../domain/types.ts';
export function mergeSkills(...lists: Skill[][]): Skill[] {
  const skills = new Map<string, Skill>();
  for (const list of lists) for (const skill of list) {
    const previous = skills.get(skill.id);
    if (previous?.interpretationStatus === 'ready' && skill.interpretationStatus !== 'ready' && previous.contentHash && previous.contentHash === skill.contentHash) {
      skills.set(skill.id, { ...previous, maintenanceStatus: skill.maintenanceStatus, updatedAt: skill.updatedAt });
    } else skills.set(skill.id, skill);
  }
  return [...skills.values()];
}
