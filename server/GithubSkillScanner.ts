import { createHash } from 'node:crypto';
import type { Skill, Source } from '../src/domain/types.ts';
import { interpretSkillMarkdown } from '../src/core/SkillInterpreter.ts';

export const officialSources = ['https://github.com/openai/plugins', 'https://github.com/remotion-dev/skills'];
export const popularQueries = ['topic:agent-skills fork:false archived:false', 'topic:codex-skills fork:false archived:false', '"agent skills" in:name,description,readme fork:false archived:false'];
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const sharedQuotas = new Map<string, { since: number; count: number; retryAt: number }>();
export function parseGithubSource(input: string): Source {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('请填写 GitHub 仓库或作者主页链接'); }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password || url.search || url.hash) throw new Error('只接受 github.com 的公开 HTTPS 链接');
  const parts = url.pathname.replace(/\/$/, '').split('/').filter(Boolean);
  const owner = parts[0], repo = parts[1]?.replace(/\.git$/, '');
  if (!owner || !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38})$/.test(owner) || (repo && !/^[a-zA-Z0-9_.-]{1,100}$/.test(repo)) || parts.length > 2 || repo === '.' || repo === '..') throw new Error('请填写仓库首页或作者主页，不包含文件路径');
  const canonical = `https://github.com/${owner}${repo ? '/' + repo : ''}`;
  return { id: hash(canonical.toLowerCase()).slice(0, 24), url: canonical, owner, repo: repo || '', name: repo ? `${owner}/${repo}` : owner, kind: repo ? 'repository' : 'author', enabled: true, status: 'idle', lastCheckedAt: null, lastSuccessAt: null, skillCount: 0, error: null, cursor: null, snapshotSha: null };
}
type TreeFile = { path: string; sha: string; size?: number; mode?: string; type: string };
interface Cursor { sha: string; repoId: string; updatedAt: string; archived: boolean; files: TreeFile[]; trees: { sha: string; prefix: string }[]; readOffset: number; readme: string; plugins: Record<string, string>; seen: string[]; completeTree: boolean; }
export class GithubLimitError extends Error {
  retryAt: number;
  constructor(message: string, retryAt = Date.now() + 3600000) { super(message); this.retryAt = retryAt; }
}
export interface ScannerOptions { fetch?: typeof fetch; token?: string; maxRequests?: number; maxDocuments?: number; }
export class GithubSkillScanner {
  fetcher: typeof fetch;
  token: string;
  maxRequests: number;
  maxDocuments: number;
  requests = 0;
  documents = 0;
  rawUnavailable = false;
  constructor(options: ScannerOptions = {}) { this.fetcher = options.fetch || fetch; this.token = options.token || ''; this.maxRequests = options.maxRequests ?? (this.token ? 150 : 40); this.maxDocuments = options.maxDocuments ?? 25; }
  private async request(path: string): Promise<any> {
    if (++this.requests > this.maxRequests) throw new GithubLimitError('本轮检查数量已达上限，下一轮继续');
    let quota: { since: number; count: number; retryAt: number } | undefined;
    if (this.fetcher === fetch) {
      const key = this.token ? hash(this.token) : 'anonymous';
      quota = sharedQuotas.get(key);
      if (!quota || Date.now() - quota.since >= 3600000) { quota = { since: Date.now(), count: 0, retryAt: 0 }; sharedQuotas.set(key, quota); }
      if (Date.now() < quota.retryAt || quota.count >= (this.token ? 900 : 50)) throw new GithubLimitError('本小时检查额度已保留进度，稍后继续', Math.max(quota.retryAt, quota.since + 3600000));
      quota.count++;
    }
    const response = await this.fetcher(`https://api.github.com${path}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Next-Step-AI-Navigator', ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}) }, signal: AbortSignal.timeout(20000), redirect: 'error' });
    if (response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')))) { const retryAt = Number(response.headers.get('x-ratelimit-reset') || 0) * 1000 || Date.now() + Number(response.headers.get('retry-after') || 3600) * 1000; if (quota) quota.retryAt = retryAt; throw new GithubLimitError('GitHub 检查额度暂时用完，保留进度后继续', retryAt); }
    if (!response.ok) throw new Error(response.status === 404 ? '来源暂时无法访问，可能已变更或转为私有' : `GitHub 暂时不可用（${response.status}）`);
    return response.json();
  }
  private async document(source: Source, sha: string, path: string): Promise<string> {
    if (++this.documents > this.maxDocuments) throw new GithubLimitError('本轮文档检查数量已达上限，下一轮继续');
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    let response: Response | undefined;
    if (!this.rawUnavailable) {
      try { response = await this.fetcher(`https://raw.githubusercontent.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/${encodeURIComponent(sha)}/${encoded}`, { signal: AbortSignal.timeout(12000), redirect: 'error' }); }
      catch { this.rawUnavailable = true; }
    }
    if (!response?.ok) {
      const content = await this.request(`/repos/${source.owner}/${source.repo}/contents/${encoded}?ref=${encodeURIComponent(sha)}`);
      if (content.encoding !== 'base64' || typeof content.content !== 'string' || Number(content.size) > 250000) throw new Error('文档格式无法读取或超过 250 KB');
      const buffer = Buffer.from(content.content, 'base64'); if (buffer.length > 250000) throw new Error('文档超过 250 KB');
      return buffer.toString('utf8');
    }
    if (Number(response.headers.get('content-length') || 0) > 250000) throw new Error('文档超过 250 KB，已保留待检查');
    const reader = response.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const result = await reader.read(); if (result.done) break; size += result.value.byteLength; if (size > 250000) { await reader.cancel(); throw new Error('文档超过 250 KB，已保留待检查'); } chunks.push(result.value); }
    return Buffer.concat(chunks).toString('utf8');
  }
  async scan(source: Source, current: Skill[] = []): Promise<{ source: Source; skills: Skill[]; complete: boolean; processed: number; total: number }> {
    if (source.kind !== 'repository') throw new Error('作者主页需要先发现其公开仓库');
    let cursor: Cursor | undefined = source.cursor ? JSON.parse(Buffer.from(source.cursor, 'base64url').toString('utf8')) : undefined;
    const found = current.filter(skill => skill.sourceType === 'github' && skill.githubUrl.startsWith(source.url + '/'));
    let processed = 0;
    try {
      if (!cursor) {
        const repo = await this.request(`/repos/${source.owner}/${source.repo}`);
        const commit = await this.request(`/repos/${source.owner}/${source.repo}/commits/${encodeURIComponent(repo.default_branch)}`);
        cursor = { sha: commit.sha, repoId: String(repo.id), updatedAt: commit.commit?.committer?.date || repo.pushed_at || now(), archived: Boolean(repo.archived), files: [], trees: [{ sha: commit.sha, prefix: '' }], readOffset: 0, readme: '', plugins: {}, seen: [], completeTree: false };
        const tree = await this.request(`/repos/${source.owner}/${source.repo}/git/trees/${cursor.sha}?recursive=1`);
        if (!tree.truncated) { cursor.files = tree.tree.filter((entry: TreeFile) => entry.type === 'blob' && entry.mode !== '120000'); cursor.trees = []; cursor.completeTree = true; }
      }
      while (cursor.trees.length) {
        const pending = cursor.trees[0];
        const tree = await this.request(`/repos/${source.owner}/${source.repo}/git/trees/${pending.sha}`);
        if (tree.truncated) throw new Error('目录仍不完整，保留现有能力等待重试');
        cursor.trees.shift();
        for (const entry of tree.tree as TreeFile[]) {
          const path = pending.prefix + entry.path;
          if (entry.type === 'tree') cursor.trees.push({ sha: entry.sha, prefix: path + '/' });
          else if (entry.type === 'blob' && entry.mode !== '120000') cursor.files.push({ ...entry, path });
        }
      }
      cursor.completeTree = true;
      const official = source.owner.toLowerCase() === 'openai' && source.repo.toLowerCase() === 'plugins';
      const files = cursor.files.filter(entry => /(^|\/)skill\.md$/i.test(entry.path) && (!official || /^plugins\/[^/]+\/skills\//.test(entry.path)));
      if (!cursor.readme) {
        const rootReadme = cursor.files.find(entry => /^readme\.md$/i.test(entry.path));
        cursor.readme = rootReadme ? (await this.document(source, cursor.sha, rootReadme.path)).slice(0, 12000) : ' ';
      }
      const deprecated = cursor.archived || /(?:this repository is deprecated|no longer maintained|此仓库已弃用)/i.test(cursor.readme);
      while (cursor.readOffset < files.length && processed < this.maxDocuments) {
        const entry = files[cursor.readOffset];
        const id = `github:${cursor.repoId}:${entry.path}`;
        const old = found.find(skill => skill.id === id);
        if (old?.contentHash === entry.sha) { old.maintenanceStatus = deprecated ? 'deprecated' : Date.now() - Date.parse(cursor.updatedAt) > 180 * 86400000 ? 'stale' : 'active'; cursor.seen.push(id); cursor.readOffset++; continue; }
        if ((entry.size || 0) > 250000) { cursor.readOffset++; continue; }
        const markdown = await this.document(source, cursor.sha, entry.path);
        let parsed: Skill;
        try { parsed = interpretSkillMarkdown(markdown, entry.path); }
        catch { cursor.readOffset++; processed++; continue; }
        const pluginRoot = entry.path.match(/^(plugins\/[^/]+)\/skills\//)?.[1];
        let pluginId = pluginRoot?.split('/')[1] || parsed.pluginId;
        if (pluginRoot && !cursor.plugins[pluginRoot]) {
          const manifestPath = `${pluginRoot}/.codex-plugin/plugin.json`;
          if (cursor.files.some(file => file.path === manifestPath)) { try { const manifest = JSON.parse(await this.document(source, cursor.sha, manifestPath)); if (typeof manifest.name === 'string') pluginId = manifest.name; } catch (error) { if (error instanceof GithubLimitError) throw error; } }
          cursor.plugins[pluginRoot] = pluginId;
        }
        const skill: Skill = { ...parsed, id, pluginId: pluginRoot ? cursor.plugins[pluginRoot] : pluginId, sourceType: 'github', sourcePath: entry.path, githubUrl: `${source.url}/blob/${cursor.sha}/${entry.path}`, contentHash: entry.sha, updatedAt: cursor.updatedAt, maintenanceStatus: deprecated ? 'deprecated' : Date.now() - Date.parse(cursor.updatedAt) > 180 * 86400000 ? 'stale' : 'active', interpretationStatus: 'pending' };
        const index = found.findIndex(item => item.id === id);
        index < 0 ? found.push(skill) : found.splice(index, 1, skill);
        cursor.seen.push(id); cursor.readOffset++; processed++;
      }
      const complete = cursor.readOffset >= files.length;
      if (complete) {
        const paths = new Set(files.map(entry => entry.path));
        for (const skill of found) if (!paths.has(skill.sourcePath)) skill.maintenanceStatus = 'removed';
      }
      return { source: { ...source, status: complete ? 'complete' : 'partial', cursor: complete ? null : Buffer.from(JSON.stringify(cursor)).toString('base64url'), snapshotSha: cursor.sha, lastCheckedAt: now(), lastSuccessAt: complete ? now() : source.lastSuccessAt, skillCount: found.filter(skill => skill.maintenanceStatus !== 'removed').length, error: null }, skills: found, complete, processed, total: files.length };
    } catch (error) {
      const partial = Boolean(cursor);
      return { source: { ...source, status: partial ? 'partial' : 'error', lastCheckedAt: now(), snapshotSha: cursor?.sha || source.snapshotSha, cursor: cursor ? Buffer.from(JSON.stringify(cursor)).toString('base64url') : source.cursor, error: error instanceof Error ? error.message : '检查失败' }, skills: found, complete: false, processed, total: cursor?.files.filter(entry => /(^|\/)skill\.md$/i.test(entry.path)).length || 0 };
    }
  }
  async discoverPopular(): Promise<Source[]> {
    const sources: Source[] = [];
    for (const query of popularQueries) {
      const result = await this.request(`/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100`);
      for (const repo of result.items || []) if (!repo.fork && !repo.archived && !repo.private) sources.push(parseGithubSource(repo.html_url));
    }
    return [...new Map(sources.map(source => [source.id, source])).values()];
  }
  async discoverAuthor(author: Source): Promise<{ sources: Source[]; cursor: string | null }> {
    const user = await this.request(`/users/${author.owner}`);
    const page = Number(author.cursor || 1);
    const path = user.type === 'Organization' ? `/orgs/${author.owner}/repos?type=public` : `/users/${author.owner}/repos?type=owner`;
    const repos = await this.request(`${path}&sort=pushed&per_page=100&page=${page}`);
    return { sources: repos.filter((repo: any) => !repo.fork && !repo.private).map((repo: any) => parseGithubSource(repo.html_url)), cursor: repos.length === 100 ? String(page + 1) : null };
  }
}
