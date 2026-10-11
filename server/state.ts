import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Skill, Source, ScanJob } from '../src/domain/types.ts';
import { officialSources, parseGithubSource } from './GithubSkillScanner.ts';
export const defaultPublicCatalogUrl = 'https://api.github.com/repos/francis20080805-ux/next-step-ai-navigator/contents/public/catalog-snapshot.json';
export interface PublicCatalogSync { lastAttemptAt: string | null; lastSuccessAt: string | null; error: string | null; }
export interface BridgeState { schemaVersion: 1; skills: Skill[]; sources: Source[]; authors: Source[]; jobs: ScanJob[]; settings: { automaticChecks: boolean; publicCatalogUrl: string }; lastDiscoveryAt: string | null; publicCatalogSync: PublicCatalogSync; aiUsage: { day: string; count: number; pausedUntil: number; message: string }; }
export class StateStore {
  path: string;
  state: BridgeState;
  private saving = Promise.resolve();
  constructor(path: string, skills: Skill[]) { this.path = path; this.state = { schemaVersion: 1, skills: structuredClone(skills), sources: officialSources.map(parseGithubSource), authors: [], jobs: [], settings: { automaticChecks: true, publicCatalogUrl: defaultPublicCatalogUrl }, lastDiscoveryAt: null, publicCatalogSync: { lastAttemptAt: null, lastSuccessAt: null, error: null }, aiUsage: { day: '', count: 0, pausedUntil: 0, message: '' } }; }
  async load() {
    try {
      const data = JSON.parse(await readFile(this.path, 'utf8'));
      if (data.schemaVersion !== 1 || !Array.isArray(data.skills) || !Array.isArray(data.sources) || !Array.isArray(data.authors)) throw new Error('本机数据格式无法识别，未覆盖原文件');
      this.state = { ...this.state, ...data, jobs: (data.jobs || []).map((job: ScanJob) => job.status === 'running' ? { ...job, status: 'paused', message: '本机服务重新启动，等待继续' } : job) };
      this.state.settings = { ...this.state.settings, publicCatalogUrl: this.state.settings.publicCatalogUrl || defaultPublicCatalogUrl };
      this.state.publicCatalogSync = { lastAttemptAt: null, lastSuccessAt: null, error: null, ...data.publicCatalogSync };
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    return this.state;
  }
  async save() {
    this.state.jobs = this.state.jobs.slice(-100);
    const contents = JSON.stringify(this.state, null, 2);
    this.saving = this.saving.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      await writeFile(temporary, contents, { mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.saving;
  }
  upsertSkills(skills: Skill[]) {
    const map = new Map(this.state.skills.map(skill => [skill.id, skill]));
    for (const skill of skills) {
      const existing = map.get(skill.id);
      if (existing?.contentHash === skill.contentHash && existing.interpretationStatus === 'ready' && skill.interpretationStatus !== 'ready') {
        const { chineseName, simpleDescription, category, tags, userPhrases, taskTypes, stage, required, conditions, excludeConditions, prerequisites, nextSkills } = existing;
        map.set(skill.id, { ...skill, chineseName, simpleDescription, category, tags, userPhrases, taskTypes, stage, required, conditions, excludeConditions, prerequisites, nextSkills, interpretationStatus: 'ready' });
      } else map.set(skill.id, skill);
    }
    this.state.skills = [...map.values()];
  }
}
