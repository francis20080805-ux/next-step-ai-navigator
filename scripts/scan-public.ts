import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GithubSkillScanner, parseGithubSource, officialSources } from '../server/GithubSkillScanner.ts';
import type { Skill, Source } from '../src/domain/types.ts';

// Only public, general sources belong here. Never read bridge-state, tasks, user subscriptions, or Codex credentials in CI.
const path = resolve('public', 'catalog-snapshot.json');
const statePath = resolve('.github', 'catalog-scan-state.json');
interface PublicSnapshot { schemaVersion: 1; sources: Source[]; skills: Skill[]; discoveryCursor: string | null; }
let snapshot: PublicSnapshot = { schemaVersion: 1, sources: officialSources.map(parseGithubSource), skills: [], discoveryCursor: null };
try { const saved = JSON.parse(await readFile(path, 'utf8')); if (saved.schemaVersion === 1 && Array.isArray(saved.sources) && Array.isArray(saved.skills)) snapshot = saved; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
try {
  const saved = JSON.parse(await readFile(statePath, 'utf8'));
  if (saved.schemaVersion === 1 && saved.cursors && typeof saved.cursors === 'object') for (const source of snapshot.sources) {
    if (typeof saved.cursors[source.id] === 'string') source.cursor = saved.cursors[source.id];
  }
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const scanner = new GithubSkillScanner({ token: process.env.GITHUB_TOKEN || '', maxRequests: process.env.GITHUB_TOKEN ? 120 : 45, maxDocuments: 100 });
const previousNextId = snapshot.sources[Math.max(0, Number(snapshot.discoveryCursor || 0))]?.id;
try {
  const candidates = await scanner.discoverPopular();
  const existing = new Map(snapshot.sources.map(source => [source.id, source]));
  for (const source of candidates) {
    const saved = existing.get(source.id);
    if (saved) saved.stars = source.stars;
    else { snapshot.sources.push(source); existing.set(source.id, source); }
  }
} catch (error) { console.log(error instanceof Error ? error.message : 'Discovery paused'); }
const officialIds = new Set(officialSources.map(url => parseGithubSource(url).id));
snapshot.sources.sort((a, b) => Number(officialIds.has(b.id)) - Number(officialIds.has(a.id)) || (b.stars || 0) - (a.stars || 0));
const popular = snapshot.sources.filter(source => !officialIds.has(source.id));
const start = Math.max(0, popular.findIndex(source => source.id === previousNextId));
const queue = [...snapshot.sources.filter(source => officialIds.has(source.id)), ...popular.slice(start), ...popular.slice(0, start)];
let scanned = 0;
for (const source of queue) {
  if (scanned >= 20 || scanner.requests >= scanner.maxRequests || scanner.documents >= 100) break;
  if (!source.enabled) continue;
  const index = snapshot.sources.findIndex(item => item.id === source.id);
  // Leave room for other repositories; a large official plugin tree keeps its own file cursor.
  scanner.maxDocuments = Math.min(100, scanner.documents + 25);
  const result = await scanner.scan(source, snapshot.skills);
  snapshot.sources[index] = result.source;
  const catalog = new Map(snapshot.skills.map(skill => [skill.id, skill]));
  for (const skill of result.skills) catalog.set(skill.id, skill);
  snapshot.skills = [...catalog.values()];
  scanned++;
  if (!officialIds.has(source.id)) snapshot.discoveryCursor = String((index + 1) % snapshot.sources.length);
  console.log(`${source.name}: ${result.processed} documents, ${result.complete ? 'complete' : 'progress saved'}`);
}
// A completed inspection is itself new snapshot data: preserve real check times so clients can detect stale jobs.
// Tree cursors are large and only used by CI. Keep full original Skill Markdown in the browser catalog.
await mkdir(dirname(statePath), { recursive: true });
const stateTemporary = `${statePath}.${randomUUID()}.tmp`;
await writeFile(stateTemporary, JSON.stringify({ schemaVersion: 1, cursors: Object.fromEntries(snapshot.sources.filter(source => source.cursor).map(source => [source.id, source.cursor])) }, null, 2));
await rename(stateTemporary, statePath);
snapshot.sources = snapshot.sources.map(source => ({ ...source, cursor: null }));
const sourceStars = new Map(snapshot.sources.filter(source => source.stars !== undefined).map(source => [source.url.toLowerCase(), source.stars!]));
snapshot.skills = snapshot.skills.map(skill => {
  const repoUrl = skill.githubUrl.match(/^https:\/\/github\.com\/[^/]+\/[^/]+/i)?.[0].toLowerCase();
  const stars = repoUrl ? sourceStars.get(repoUrl) : undefined;
  return stars === undefined ? skill : { ...skill, githubStars: stars };
});
const normalize = (value: PublicSnapshot) => JSON.stringify(value);
let existing = '';
try { existing = normalize(JSON.parse(await readFile(path, 'utf8'))); } catch {}
if (normalize(snapshot) !== existing) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2)); await rename(temporary, path);
  console.log('Public catalog snapshot updated');
} else console.log('Public catalog content unchanged');
