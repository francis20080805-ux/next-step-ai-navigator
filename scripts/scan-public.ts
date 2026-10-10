import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { GithubSkillScanner, parseGithubSource, officialSources } from '../server/GithubSkillScanner.ts';
import type { Skill, Source } from '../src/domain/types.ts';

// Only public, general sources belong here. Never read bridge-state, tasks, user subscriptions, or Codex credentials in CI.
const path = resolve('public', 'catalog-snapshot.json');
interface PublicSnapshot { schemaVersion: 1; sources: Source[]; skills: Skill[]; discoveryCursor: string | null; }
let snapshot: PublicSnapshot = { schemaVersion: 1, sources: officialSources.map(parseGithubSource), skills: [], discoveryCursor: null };
try { const saved = JSON.parse(await readFile(path, 'utf8')); if (saved.schemaVersion === 1 && Array.isArray(saved.sources) && Array.isArray(saved.skills)) snapshot = saved; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
const scanner = new GithubSkillScanner({ token: process.env.GITHUB_TOKEN || '', maxRequests: process.env.GITHUB_TOKEN ? 120 : 45, maxDocuments: 100 });
try {
  const candidates = await scanner.discoverPopular();
  const existing = new Set(snapshot.sources.map(source => source.id));
  for (const source of candidates) if (!existing.has(source.id)) { snapshot.sources.push(source); existing.add(source.id); }
} catch (error) { console.log(error instanceof Error ? error.message : 'Discovery paused'); }
const start = Math.max(0, Number(snapshot.discoveryCursor || 0));
let scanned = 0;
for (let offset = 0; offset < snapshot.sources.length && scanned < 20; offset++) {
  const index = (start + offset) % snapshot.sources.length;
  const source = snapshot.sources[index];
  if (!source.enabled) continue;
  const result = await scanner.scan(source, snapshot.skills);
  snapshot.sources[index] = result.source;
  const catalog = new Map(snapshot.skills.map(skill => [skill.id, skill]));
  for (const skill of result.skills) catalog.set(skill.id, skill);
  snapshot.skills = [...catalog.values()];
  scanned++;
  snapshot.discoveryCursor = String((index + 1) % snapshot.sources.length);
  console.log(`${source.name}: ${result.processed} documents, ${result.complete ? 'complete' : 'progress saved'}`);
  if (scanner.requests >= scanner.maxRequests || scanner.documents >= scanner.maxDocuments) break;
}
// A completed inspection is itself new snapshot data: preserve real check times so clients can detect stale jobs.
const normalize = (value: PublicSnapshot) => JSON.stringify(value);
let existing = '';
try { existing = normalize(JSON.parse(await readFile(path, 'utf8'))); } catch {}
if (normalize(snapshot) !== existing) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2)); await rename(temporary, path);
  console.log('Public catalog snapshot updated');
} else console.log('Public catalog content unchanged');
