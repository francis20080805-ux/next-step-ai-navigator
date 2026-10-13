import type { AppData } from '../domain/types.ts';
export const defaultData = (): AppData => ({ schemaVersion: 1, tasks: [], skills: [], favoriteSkillIds: [], settings: { preferAI: true, automaticChecks: true, bridgeUrl: 'http://127.0.0.1:8787', publicCatalogUrl: 'https://api.github.com/repos/francis20080805-ux/next-step-ai-navigator/contents/public/catalog-snapshot.json' } });
let dbPromise: Promise<IDBDatabase> | undefined;
function database() {
  return dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('next-step-navigator', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('app');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadAppData(): Promise<AppData> {
  const db = await database();
  const value = await new Promise<AppData | undefined>((resolve, reject) => {
    const request = db.transaction('app').objectStore('app').get('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return value ? validateBackup(value) : defaultData();
}
export async function saveAppData(data: AppData): Promise<void> {
  const db = await database();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('app', 'readwrite');
    transaction.objectStore('app').put(data, 'state');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('保存被中断，请重试。'));
  });
}
export function validateBackup(value: unknown): AppData {
  const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
  const fields = (v: Record<string, unknown>, names: string[]) => names.every(k => typeof v[k] === 'string');
  const stages = ['prepare','design','create','edit','check','error','export','publish'];
  const categories = ['video','spreadsheet','presentation','website','image','pdf','document','email','calendar','research','design','other'];
  const enumValue = (v: unknown, choices: string[]) => typeof v === 'string' && choices.includes(v);
  if (!object(value)) throw new Error('这不是有效的应用备份。');
  const data = value as unknown as AppData;
  if (data.schemaVersion !== 1 || !Array.isArray(data.tasks) || !Array.isArray(data.skills) || !strings(data.favoriteSkillIds)) throw new Error('备份格式不正确或版本不受支持，原有数据没有改变。');
  const intentValid = (v: unknown) => object(v) && enumValue(v.category,categories) && ['goals','existingMaterials','missingMaterials','completedActions'].every(k=>strings(v[k])) && object(v.requirements) && Object.values(v.requirements).every(r=>enumValue(r,['required','excluded','unspecified'])) && object(v.parameters) && Object.values(v.parameters).every(p=>typeof p==='string') && typeof v.subtype==='string' && ['hasExistingOutput','hasDesign','hasError','useCloud'].every(k=>typeof v[k]==='boolean');
  const stepValid = (v: unknown) => object(v) && fields(v,['id','action','title','description','skillName']) && (v.skillId===null || typeof v.skillId==='string') && enumValue(v.capabilityKind,['skill','connector']) && enumValue(v.stage,stages) && enumValue(v.status,['pending','completed','skipped']) && typeof v.optional==='boolean' && strings(v.dependencies);
  if (data.tasks.some(t => !object(t) || !fields(t,['id','title','originalInput','createdAt','updatedAt']) || !Array.isArray(t.steps) || !t.steps.every(stepValid) || !intentValid(t.intent) || !strings(t.inputs) || typeof t.favorite!=='boolean' || !enumValue(t.mode,['local','codex']) || !enumValue(t.status,['planned','started','completed']))) throw new Error('备份中的任务数据不完整，原有数据没有改变。');
  if (data.skills.some(s => !object(s) || !fields(s,['id','name','chineseName','pluginId','description','skillMarkdown','simpleDescription','category','githubUrl','version','updatedAt','sourcePath','contentHash']) || !['taskTypes','tags','userPhrases','conditions','excludeConditions','prerequisites','nextSkills'].every(k=>strings(s[k])) || !enumValue(s.stage,stages) || !enumValue(s.maintenanceStatus,['active','stale','deprecated','removed','unavailable']) || !enumValue(s.sourceType,['system','github','import']) || !enumValue(s.capabilityKind,['skill','connector']) || !enumValue(s.interpretationStatus,['ready','pending','failed']) || typeof s.required!=='boolean')) throw new Error('备份中的能力数据不完整，原有数据没有改变。');
  if (data.skills.some(skill => skill.githubStars !== undefined && (!Number.isSafeInteger(skill.githubStars) || skill.githubStars < 0))) throw new Error('备份中的仓库星数不正确，原有数据没有改变。');
  const settings = { ...defaultData().settings, ...(data.settings ?? {}) };
  if (typeof settings.preferAI !== 'boolean' || typeof settings.automaticChecks !== 'boolean' || typeof settings.bridgeUrl !== 'string' || typeof settings.publicCatalogUrl !== 'string') throw new Error('备份设置不正确。');
  const bridge = new URL(settings.bridgeUrl);
  if (!['http:','https:'].includes(bridge.protocol) || !['localhost','127.0.0.1','[::1]'].includes(bridge.hostname) || bridge.username || bridge.password) throw new Error('备份中的本机连接地址不正确。');
  return { ...data, settings };
}
export function downloadBackup(data: AppData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `下一步备份-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
