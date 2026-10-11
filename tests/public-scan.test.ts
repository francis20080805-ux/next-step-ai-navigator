import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';
import { GithubSkillScanner, parseGithubSource, officialSources } from '../server/GithubSkillScanner.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import type { Source, Skill } from '../src/domain/types.ts';

// Exercise the real CI entrypoint with in-memory filesystem/network boundaries.
async function runPublicScan(snapshot: any, state: any, candidates: Source[]) {
  const files = new Map<string, string>([[resolve('public/catalog-snapshot.json'), JSON.stringify(snapshot)], [resolve('.github/catalog-scan-state.json'), JSON.stringify(state)]]);
  const scans: Source[] = [];
  class Scanner {
    requests = 0; documents = 0; maxRequests = 120; maxDocuments = 100;
    async discoverPopular() { return candidates; }
    async scan(source: Source, skills: Skill[]) {
      scans.push(structuredClone(source)); this.requests++; this.documents += 25;
      return { source: { ...source, status: 'partial', cursor: source.cursor || 'new-progress', lastCheckedAt: new Date().toISOString() }, skills, processed: 25, complete: false };
    }
  }
  const code = ts.transpileModule(await readFile(new URL('../scripts/scan-public.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText.replace(/^import .*;\r?\n/gm, '').replace(/^export \{\};?\r?\n/gm, '');
  const bindings = {
    readFile: async (path: string) => { const value = files.get(path); if (value === undefined) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return value; },
    writeFile: async (path: string, value: string) => { files.set(path, value); },
    rename: async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); },
    mkdir: async () => {}, dirname, resolve, randomUUID, GithubSkillScanner: Scanner, parseGithubSource, officialSources,
    process: { env: { GITHUB_TOKEN: 'test-fixture-only' } }, console: { log() {} }
  };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction(...Object.keys(bindings), code)(...Object.values(bindings));
  return { scans, snapshot: JSON.parse(files.get(resolve('public/catalog-snapshot.json'))!), state: JSON.parse(files.get(resolve('.github/catalog-scan-state.json'))!) };
}

test('CI keeps fixed-source cursors and rotates popular scans after official sources when stars reorder', async () => {
  const officials = officialSources.map(parseGithubSource);
  const low = { ...parseGithubSource('https://github.com/example/low'), stars: 1 };
  const high = { ...parseGithubSource('https://github.com/example/high'), stars: 100 };
  const middle = { ...parseGithubSource('https://github.com/example/middle'), stars: 10 };
  const sources = [...officials, low, middle, high];
  const cursors = Object.fromEntries(sources.map(source => [source.id, source.name + '-saved-cursor']));
  const snapshot = { schemaVersion: 1, sources, skills: [seedSkills[0]], discoveryCursor: '3' };
  const result = await runPublicScan(snapshot, { schemaVersion: 1, cursors }, [{ ...low, stars: 2 }, { ...high, stars: 200 }, { ...middle, stars: 20 }]);
  assert.deepEqual(result.scans.map(source => source.id), [...officials.map(source => source.id), middle.id, low.id]);
  assert.ok(result.scans.some(source => !officials.some(official => official.id === source.id)));
  for (const source of result.scans) assert.equal(source.cursor, cursors[source.id]);
  for (const source of sources) assert.equal(result.state.cursors[source.id], cursors[source.id]);
  assert.equal(result.snapshot.sources.every((source: Source) => source.cursor === null), true);
  assert.equal(result.snapshot.sources[Number(result.snapshot.discoveryCursor)].id, officials[0].id);
  assert.deepEqual(result.snapshot.skills, snapshot.skills);
});

test('CI migrates legacy inline cursors and writes them only to scan state without dropping raw Markdown', async () => {
  const sources = officialSources.map(url => ({ ...parseGithubSource(url), cursor: url + '-legacy-progress' }));
  const skill = { ...seedSkills[0], interpretationStatus: 'ready', chineseName: '保存的中文说明', simpleDescription: '保留这一句用途', contentHash: 'fixed-hash', skillMarkdown: '---\nname: untouched\ndescription: Original\n---\nFull original document.' };
  const result = await runPublicScan({ schemaVersion: 1, sources, skills: [skill], discoveryCursor: null }, { schemaVersion: 1, cursors: {} }, []);
  for (const source of sources) assert.equal(result.state.cursors[source.id], source.cursor);
  assert.equal(result.snapshot.sources.every((source: Source) => source.cursor === null), true);
  assert.deepEqual(result.snapshot.skills, [skill]);
});

test('real scanner preserves ready Chinese interpretation for unchanged blob and marks only missing paths removed', async () => {
  const source = parseGithubSource('https://github.com/example/skills');
  const original = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: source.url + '/blob/old/tools/SKILL.md', contentHash: 'same-blob', interpretationStatus: 'ready' as const, chineseName: '已经理解的能力', simpleDescription: '已保存的通俗用途', skillMarkdown: '原始完整内容' };
  const removed = { ...original, id: 'github:42:gone/SKILL.md', sourcePath: 'gone/SKILL.md', contentHash: 'gone-blob' };
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    const value = url.endsWith('/repos/example/skills') ? { id: 42, default_branch: 'main' }
      : url.endsWith('/commits/main') ? { sha: 'fixed-commit', commit: { committer: { date: new Date().toISOString() } } }
      : { truncated: false, tree: [{ path: 'tools/SKILL.md', type: 'blob', mode: '100644', sha: 'same-blob', size: 120 }] };
    if (url.startsWith('https://raw.')) throw new Error('Unchanged content must not be downloaded');
    return new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  };
  const result = await new GithubSkillScanner({ fetch: fetcher }).scan(source, [structuredClone(original), removed]);
  assert.equal(result.complete, true); assert.equal(result.processed, 0);
  const saved = result.skills.find(skill => skill.id === original.id)!;
  assert.equal(saved.interpretationStatus, 'ready'); assert.equal(saved.chineseName, original.chineseName); assert.equal(saved.simpleDescription, original.simpleDescription); assert.equal(saved.skillMarkdown, original.skillMarkdown);
  assert.equal(saved.maintenanceStatus, 'active'); assert.equal(result.skills.find(skill => skill.id === removed.id)?.maintenanceStatus, 'removed');
});
