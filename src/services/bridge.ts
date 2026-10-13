import type { BridgeStatus, InterpretationResult, ScanJob, Skill, Source, TaskRecord } from '../domain/types.ts';
const TOKEN_KEY = 'next-step-bridge-session';
export function hasBridgeToken() { return Boolean(sessionStorage.getItem(TOKEN_KEY)); }
export function disconnectBridge() { sessionStorage.removeItem(TOKEN_KEY); }
export const offlineStatus: BridgeStatus = { connected: false, codexAvailable: false, authMode: 'none', message: '正在使用本地推荐', backgroundEnabled: true, interpretedToday: 0 };
export function validBridgeUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) throw new Error('本机连接地址需要使用 localhost 或 127.0.0.1。');
  return url.origin;
}
async function request<T>(base: string, path: string, body?: unknown, method?: string): Promise<T> {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const response = await fetch(validBridgeUrl(base) + path, { method: method ?? (body === undefined ? 'GET' : 'POST'), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(path.includes('interpret') ? 125000 : 15000) });
  const data = await response.json().catch(() => ({ error: '本机服务返回的内容无法读取。' }));
  if (!response.ok) {
    if (response.status === 401) disconnectBridge();
    throw new Error(data.error ?? data.message ?? `连接失败（${response.status}），输入已保留。`);
  }
  return data;
}
export async function pairBridge(base: string, code: string) {
  const result = await request<{ token: string }>(base, '/api/pair', { code });
  if (!result.token) throw new Error('配对没有成功，请使用最新的连接码。');
  sessionStorage.setItem(TOKEN_KEY, result.token);
}
export const getBridgeStatus = (base: string) => request<BridgeStatus>(base, '/api/status');
export const interpretTask = (base: string, input: string, previous: TaskRecord | undefined, catalog: Skill[]) => request<InterpretationResult>(base, '/api/tasks/interpret', { input, previous, catalog: catalog.filter(skill=>skill.interpretationStatus==='ready').map(skill=>({...skill,skillMarkdown:''})) });
export const interpretImportedSkill = (base: string, markdown: string, filename?: string) => request<{ skill: Skill; mode: 'local' | 'codex'; notice?: string }>(base, '/api/skills/interpret', { markdown, filename });
export const getCatalog = (base: string) => request<Skill[]>(base, '/api/catalog');
export const getSources = (base: string) => request<Source[]>(base, '/api/sources');
export const getAuthors = (base: string) => request<Source[]>(base, '/api/authors');
export const getJobs = (base: string) => request<ScanJob[]>(base, '/api/jobs');
export const addSource = (base: string, url: string, author = false) => request<Source>(base, author ? '/api/authors' : '/api/sources', { url });
export const deleteSource = (base: string, id: string, author = false) => request<void>(base, `${author ? '/api/authors' : '/api/sources'}/${encodeURIComponent(id)}`, undefined, 'DELETE');
export const updateSource = (base: string, id: string, enabled: boolean, author = false) => request<Source>(base, `${author ? '/api/authors' : '/api/sources'}/${encodeURIComponent(id)}`, { enabled }, 'PATCH');
export const scanSource = (base: string, id: string) => request<ScanJob>(base, `/api/sources/${encodeURIComponent(id)}/scan`, {});
export const discoverSources = (base: string) => request<ScanJob>(base, '/api/scan/discover', {});
export const setAutomaticChecks = (base: string, automaticChecks: boolean) => request<unknown>(base, '/api/settings', { automaticChecks }, 'PATCH');
export const getBridgeBackup = (base: string) => request<unknown>(base, '/api/backup');
export const restoreBridgeBackup = (base: string, backup: unknown) => request<{restored:boolean;skillCount:number;sourceCount:number;authorCount:number}>(base, '/api/backup/restore', { backup });
