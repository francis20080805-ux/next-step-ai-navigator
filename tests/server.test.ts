import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createBridgeServer, validHost, validOrigin, publicCatalogRequest, readPublicCatalog } from '../server/index.ts';
import { CodexBridge, codexArgs, parseCodexEvents } from '../server/CodexBridge.ts';
import { GithubSkillScanner, parseGithubSource } from '../server/GithubSkillScanner.ts';
import { validateTaskIntent, validateSkillExplanation } from '../server/schemas.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import { StateStore, defaultPublicCatalogUrl } from '../server/state.ts';

class LocalCodex extends CodexBridge {
  override async status() { return { codexAvailable: true, authMode: 'none' as const, message: '本机未登录' }; }
  override async interpret(_prompt: string, _schema: unknown, _priority?: 'foreground' | 'background'): Promise<unknown> { throw new Error('本机未登录'); }
}
test('health is unpaired and private while preserving Host and Origin checks', async () => {
  class ProbeCodex extends LocalCodex {
    statusCalls = 0;
    override async status() { this.statusCalls++; return super.status(); }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-health-test-')), codex = new ProbeCodex();
  await writeFile(join(directory, 'index.html'), '<html>Local page</html>');
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), codex, staticRoot: directory });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const port = (bridge.server.address() as { port: number }).port, base = `http://127.0.0.1:${port}`;
  const headers = { Origin: 'http://127.0.0.1:8787' };
  try {
    const response = await fetch(base + '/api/health', { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { app: 'next-step-ai-navigator', ready: false });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(codex.statusCalls, 0);
    assert.equal((await fetch(base + '/api/catalog', { headers })).status, 401);
    assert.equal((await fetch(base + '/api/health')).status, 403);
    assert.equal((await fetch(base + '/api/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
    const badHost = await new Promise<number | undefined>((resolve, reject) => {
      const request = httpRequest(base + '/api/health', { headers: { ...headers, Host: `evil.example:${port}` } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject); request.end();
    });
    assert.equal(badHost, 403);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});

test('health reads the same static root as page serving and requires a regular index file', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-health-static-test-')), index = join(directory, 'index.html');
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), codex: new LocalCodex(), serve: true, staticRoot: directory });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`, headers = { Origin: base };
  const health = async () => (await fetch(base + '/api/health', { headers })).json();
  try {
    assert.deepEqual(await health(), { app: 'next-step-ai-navigator', ready: false });
    await mkdir(index);
    assert.deepEqual(await health(), { app: 'next-step-ai-navigator', ready: false });
    await rm(index, { recursive: true });
    await writeFile(index, '<html><body>Ready local app</body></html>');
    assert.deepEqual(await health(), { app: 'next-step-ai-navigator', ready: true });
    const page = await fetch(base + '/'); assert.equal(page.status, 200); assert.match(await page.text(), /Ready local app/);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});

test('health defaults to the production dist directory without network access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-health-production-test-'));
  const expected = await stat(new URL('../dist/index.html', import.meta.url)).then(file => file.isFile(), () => false);
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), codex: new LocalCodex(), serve: true, catalogFetch: async () => { throw new Error('network must not be called'); } });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + '/api/health', { headers: { Origin: base } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { app: 'next-step-ai-navigator', ready: expected });
    if (expected) assert.equal((await fetch(base + '/')).status, 200);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});

test('bridge requires allowed Origin, loopback Host, one-use pairing and memory-only token', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-server-test-'));
  const statePath = join(directory, 'state.json');
  const bridge = await createBridgeServer({ statePath, pairCode: '123456', codex: new LocalCodex() });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const port = (bridge.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/status`)).status, 403);
    assert.equal((await fetch(`${base}/api/status`, { headers: { ...headers, Origin: 'https://evil.example' } })).status, 403);
    const badHostStatus = await new Promise<number | undefined>((resolve, reject) => { const request = httpRequest(`${base}/api/status`, { headers: { ...headers, Host: `evil.example:${port}` } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject); request.end(); });
    assert.equal(badHostStatus, 403);
    const status = await (await fetch(`${base}/api/status`, { headers })).json();
    assert.equal(status.connected, true); assert.equal(status.authMode, 'none'); assert.equal('token' in status, false); assert.equal('pairCode' in status, false);
    assert.equal((await fetch(`${base}/api/catalog`, { headers })).status, 401);
    const paired = await (await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    assert.equal(typeof paired.token, 'string');
    assert.equal((await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).status, 403);
    const authorized = { ...headers, Authorization: `Bearer ${paired.token}` };
    assert.equal((await fetch(`${base}/api/catalog`, { headers: authorized })).status, 200);
    assert.equal((await fetch(`${base}/api/settings`, { method: 'PATCH', headers: authorized, body: JSON.stringify({ automaticChecks: false }) })).status, 200);
    const stored = await readFile(statePath, 'utf8'); assert.equal(stored.includes(paired.token), false); assert.equal(stored.includes('123456'), false);
    assert.equal((await fetch(`${base}/api/sources`, { method: 'POST', headers: authorized, body: JSON.stringify({ url: 'http://169.254.169.254/latest/meta-data' }) })).status, 400);
    const result = await (await fetch(`${base}/api/tasks/interpret`, { method: 'POST', headers: authorized, body: JSON.stringify({ input: '视频已经做好了，只要加字幕，最后导出' }) })).json();
    assert.equal(result.kind, 'task'); assert.equal(result.task.mode, 'local'); assert.match(result.notice, /本地/);
    assert.equal((await fetch(`${base}/api/exec`, { method: 'POST', headers: authorized, body: JSON.stringify({ command: 'calc.exe' }) })).status, 404);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
test('task interpretation accepts a large explained catalog and preserves remaining video steps', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-large-task-catalog-'));
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), pairCode: '123456', codex: new LocalCodex() });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`;
  const headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  try {
    const paired = await (await fetch(base + '/api/pair', { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    const catalog = [...seedSkills, ...Array.from({ length: 1501 }, (_, index) => ({ ...seedSkills[0], id: `large-${index}`, description: 'a'.repeat(1200) }))];
    const requestBody = JSON.stringify({ input: '视频已经做好了，只加字幕，最后导出', catalog });
    assert.ok(Buffer.byteLength(requestBody) > 1000000);
    assert.ok(Buffer.byteLength(requestBody) < 5000000);
    const response = await fetch(base + '/api/tasks/interpret', { method: 'POST', headers: { ...headers, Authorization: `Bearer ${paired.token}` }, body: requestBody });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.kind, 'task'); assert.equal(result.task.mode, 'local');
    assert.deepEqual(result.task.steps.filter((step: { status: string }) => step.status === 'pending').map((step: { action: string }) => step.action), ['video.captions', 'video.export']);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
test('origin and Github URLs have exact allowlists', () => {
  assert.equal(validOrigin('http://127.0.0.1:5173', ['http://127.0.0.1:5173']), true);
  assert.equal(validOrigin('http://127.0.0.1:5173.evil.example', ['http://127.0.0.1:5173']), false);
  assert.equal(validHost('127.0.0.1:8787', 8787), true); assert.equal(validHost('0.0.0.0:8787', 8787), false);
  for (const url of ['https://github.com.evil.example/openai/plugins', 'https://a:b@github.com/openai/plugins', 'http://github.com/openai/plugins', 'https://github.com/openai/plugins?url=evil', 'https://github.com/openai/plugins/tree/main']) assert.throws(() => parseGithubSource(url));
  assert.equal(parseGithubSource('https://github.com/openai/plugins').kind, 'repository'); assert.equal(parseGithubSource('https://github.com/remotion-dev').kind, 'author');
});
test('local static pages preserve same-origin Referer without weakening explicit Origin validation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-origin-test-'));
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), codex: new LocalCodex(), serve: true });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`;
  try {
    const response = await fetch(base + '/api/status', { headers: { Origin: base } }); assert.equal(response.status, 200); assert.equal(response.headers.get('referrer-policy'), 'same-origin'); await response.json();
    const sameOrigin = { 'Sec-Fetch-Site': 'same-origin', Referer: base + '/settings' };
    assert.equal((await fetch(base + '/api/status', { headers: sameOrigin })).status, 200);
    assert.equal((await fetch(base + '/api/status', { headers: { ...sameOrigin, Origin: 'https://evil.example' } })).status, 403);
    assert.equal((await fetch(base + '/api/status', { headers: { ...sameOrigin, Referer: 'https://evil.example/' } })).status, 403);
    assert.equal((await fetch(base + '/api/status', { headers: { ...sameOrigin, 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await fetch(base + '/api/status', { headers: { 'Sec-Fetch-Site': 'same-origin' } })).status, 403);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
test('Codex invocation limits provider, tools, sandbox and stdin', () => {
  const args = codexArgs('/safe/schema.json', '/empty');
  for (const arg of ['--ignore-user-config', '--ephemeral', '--json', '--output-schema', 'read-only', 'forced_login_method="chatgpt"', 'web_search="disabled"', 'shell_tool', 'hooks', 'apps', 'browser_use', 'plugins']) assert.ok(args.includes(arg));
  assert.equal(args.at(-1), '-'); assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  const message = JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"ok":true}' } });
  assert.throws(() => parseCodexEvents(message), /确认/);
  assert.deepEqual(parseCodexEvents(message + '\n' + JSON.stringify({ type: 'turn.completed' })), { ok: true });
  assert.throws(() => parseCodexEvents(message + '\n' + JSON.stringify({ type: 'turn.failed', error: { message: 'quota' } })), /quota/);
});
test('background usage and pause survive a bridge restart', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-usage-test-'));
  const statePath = join(directory, 'state.json');
  try {
    const first = await createBridgeServer({ statePath, codex: new LocalCodex() });
    first.store.state.aiUsage = { day: '2026-10-10', count: 20, pausedUntil: 1234567890000, message: '现有额度暂停' }; await first.store.save();
    const codex = new LocalCodex(); await createBridgeServer({ statePath, codex });
    assert.equal(codex.backgroundDay, '2026-10-10'); assert.equal(codex.interpretedToday, 20); assert.equal(codex.pausedUntil, 1234567890000);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('desktop runtime pauses background calls without altering saved settings and resumes only when explicitly enabled', async () => {
  class QueueCodex extends LocalCodex {
    calls = 0;
    override async interpret() { this.calls++; return { chineseName: '整理表格', simpleDescription: '帮你整理表格数据', category: 'spreadsheet', tags: [], userPhrases: [], taskTypes: ['spreadsheet'], stage: 'edit', required: false, conditions: [], excludeConditions: [], prerequisites: [], nextSkills: [] }; }
  }
  class QueueScanner extends GithubSkillScanner {
    discoveries = 0; scans = 0;
    override async discoverPopular() { this.discoveries++; return []; }
    override async scan(source: ReturnType<typeof parseGithubSource>) { this.scans++; return { source: { ...source, status: 'complete' as const, lastCheckedAt: new Date().toISOString() }, skills: [], complete: true, processed: 0, total: 0 }; }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-desktop-pause-test-')), path = join(directory, 'state.json');
  const initial = new StateStore(path, seedSkills), time = new Date().toISOString();
  initial.state.skills.push({ ...seedSkills[0], id: 'import-pending', contentHash: 'pending-one', interpretationStatus: 'pending' });
  initial.state.sources = [parseGithubSource('https://github.com/example/skills')];
  initial.state.jobs = [{ id: 'original-queue', sourceId: 'import-pending', kind: 'interpret', status: 'queued', message: '等待解释', processed: 0, total: 1, createdAt: time, updatedAt: time }];
  await initial.save(); const originalFile = await readFile(path, 'utf8');
  const codex = new QueueCodex(), scanner = new QueueScanner(); let scannerFactories = 0, catalogCalls = 0;
  const bridge = await createBridgeServer({ statePath: path, pairCode: '123456', backgroundPaused: true, codex, scanner: () => { scannerFactories++; return scanner; }, catalogFetch: async () => { catalogCalls++; return json({ schemaVersion: 1, skills: [] }); } });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`, headers = { Origin: base, 'Content-Type': 'application/json' };
  const status = async () => (await fetch(base + '/api/status', { headers })).json();
  try {
    const pausedState = structuredClone(bridge.store.state);
    assert.equal((await status()).backgroundEnabled, false);
    await bridge.tick(); await bridge.tick();
    assert.deepEqual([scannerFactories, scanner.discoveries, scanner.scans, catalogCalls, codex.calls], [0, 0, 0, 0, 0]);
    assert.deepEqual(bridge.store.state, pausedState);
    assert.equal(bridge.store.state.settings.automaticChecks, true);
    assert.equal(await readFile(path, 'utf8'), originalFile);
    const paired = await (await fetch(base + '/api/pair', { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    const authorized = { ...headers, Authorization: `Bearer ${paired.token}` };
    const patch = async (value: unknown) => fetch(base + '/api/settings', { method: 'PATCH', headers: authorized, body: JSON.stringify(value) });
    assert.equal((await patch({ publicCatalogUrl: defaultPublicCatalogUrl })).status, 200);
    await bridge.tick(); assert.equal(scannerFactories, 0); assert.equal((await status()).backgroundEnabled, false);
    assert.equal((await patch({ automaticChecks: false })).status, 200);
    await bridge.tick(); assert.equal(scannerFactories, 0); assert.equal(bridge.store.state.settings.automaticChecks, false);
    assert.deepEqual(bridge.store.state.jobs, pausedState.jobs);
    assert.equal((await patch({ automaticChecks: true })).status, 200);
    assert.equal((await status()).backgroundEnabled, true);
    await bridge.tick();
    assert.equal(scanner.discoveries, 1); assert.equal(scanner.scans, 1); assert.equal(catalogCalls, 1); assert.equal(codex.calls, 1);
    assert.equal(bridge.store.state.skills.find(skill => skill.id === 'import-pending')?.interpretationStatus, 'ready');
    const persisted = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(persisted.settings.automaticChecks, true); assert.equal('backgroundPaused' in persisted, false);
    assert.ok(bridge.store.state.jobs.some(job => job.id === 'original-queue'));
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});

test('AI explanation rejects hallucinated associations and invalid task requirements', () => {
  assert.throws(() => validateTaskIntent({ category: 'video' }));
  const base = seedSkills.find(skill => skill.capabilityKind === 'skill')!;
  const explanation = { chineseName: '处理任务', simpleDescription: '帮你整理下一步', category: 'video', tags: [], userPhrases: [], taskTypes: ['video'], stage: 'create', required: true, conditions: [], excludeConditions: [], prerequisites: ['invented-id'], nextSkills: [] };
  assert.throws(() => validateSkillExplanation(explanation, base, seedSkills), /不存在/);
  const interpreted = validateSkillExplanation({ ...explanation, prerequisites: [] }, base, seedSkills);
  assert.equal(interpreted.interpretationStatus, 'ready'); assert.equal(interpreted.category, '视频');
  assert.throws(() => validateSkillExplanation({ ...explanation, prerequisites: [], command: 'run this' }, base, seedSkills), /未知字段/);
});
test('same-content public snapshots preserve local explanations while changed documents return to pending', () => {
  const store = new StateStore('unused-state.json', []);
  const original = { ...seedSkills[0], contentHash: 'one', chineseName: '保存的中文解释', interpretationStatus: 'ready' as const };
  store.upsertSkills([original]);
  store.upsertSkills([{ ...original, interpretationStatus: 'pending', chineseName: '待解释', maintenanceStatus: 'stale', githubUrl: 'https://github.com/example/skills/blob/new/SKILL.md' }]);
  assert.equal(store.state.skills[0].chineseName, '保存的中文解释'); assert.equal(store.state.skills[0].interpretationStatus, 'ready'); assert.equal(store.state.skills[0].maintenanceStatus, 'stale'); assert.match(store.state.skills[0].githubUrl, /new/);
  store.upsertSkills([{ ...original, contentHash: 'two', interpretationStatus: 'pending', chineseName: '内容已更新' }]);
  assert.equal(store.state.skills[0].interpretationStatus, 'pending'); assert.equal(store.state.skills[0].chineseName, '内容已更新');
});
test('public snapshot API only accepts raw JSON at the precise contents path without authentication', async () => {
  const request = publicCatalogRequest(defaultPublicCatalogUrl);
  assert.equal(request.url.hostname, 'api.github.com'); assert.equal(request.headers.Accept, 'application/vnd.github.raw+json'); assert.equal('Authorization' in request.headers, false);
  for (const url of ['https://api.github.com.evil.example/repos/a/b/contents/public/catalog-snapshot.json', 'https://api.github.com/users/a', 'https://api.github.com/repos/a/b/contents/auth.json', defaultPublicCatalogUrl + '?ref=main', defaultPublicCatalogUrl + '#data', defaultPublicCatalogUrl.replace('https://', 'https://secret@')]) assert.throws(() => publicCatalogRequest(url));
  const snapshotSkill = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: 'https://github.com/example/skills/blob/fixed/tools/SKILL.md', contentHash: 'one', interpretationStatus: 'pending' as const };
  const fetcher: typeof fetch = async (input, options) => { assert.equal(String(input), defaultPublicCatalogUrl); assert.equal(new Headers(options?.headers).get('accept'), 'application/vnd.github.raw+json'); assert.equal(new Headers(options?.headers).has('authorization'), false); assert.equal(options?.redirect, 'error'); return json({ schemaVersion: 1, skills: [snapshotSkill] }); };
  assert.equal((await readPublicCatalog(defaultPublicCatalogUrl, fetcher))[0].id, snapshotSkill.id);
  await assert.rejects(readPublicCatalog(defaultPublicCatalogUrl, async () => json({ name: 'catalog-snapshot.json', encoding: 'base64', content: 'fake' })), /原文 JSON/);
  await assert.rejects(readPublicCatalog(defaultPublicCatalogUrl, async () => json({}, 200, { 'Content-Length': '25000001' })), /25 MB/);
});
test('public catalog accepts a real-sized snapshot and bounds headerless streaming bodies at 25 MB', async () => {
  const skill = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: 'https://github.com/example/skills/blob/fixed/tools/SKILL.md', contentHash: 'one', interpretationStatus: 'pending' as const };
  const large = JSON.stringify({ schemaVersion: 1, skills: [skill], cursor: 'x'.repeat(14180000) });
  assert.equal((await readPublicCatalog(defaultPublicCatalogUrl, async () => new Response(large)))[0].id, skill.id);
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(12500000)); controller.enqueue(new Uint8Array(12500001)); }, cancel() { cancelled = true; } });
  await assert.rejects(readPublicCatalog(defaultPublicCatalogUrl, async () => new Response(oversized)), /25 MB/);
  assert.equal(cancelled, true);
});
test('empty legacy snapshot settings migrate to the published anonymous API URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-default-test-')), path = join(directory, 'state.json');
  try {
    const original = new StateStore(path, seedSkills); assert.equal(original.state.settings.publicCatalogUrl, defaultPublicCatalogUrl);
    original.state.settings.publicCatalogUrl = ''; original.state.settings.automaticChecks = false;
    const legacy: any = structuredClone(original.state); delete legacy.publicCatalogSync;
    await writeFile(path, JSON.stringify(legacy));
    const loaded = new StateStore(path, seedSkills); await loaded.load(); assert.equal(loaded.state.settings.publicCatalogUrl, defaultPublicCatalogUrl); assert.equal(loaded.state.settings.automaticChecks, false);
    assert.deepEqual(loaded.state.publicCatalogSync, { lastAttemptAt: null, lastSuccessAt: null, error: null });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('API snapshot pending skills enter background interpretation and unchanged snapshots reuse ready results', async () => {
  class SnapshotCodex extends LocalCodex {
    priorities: string[] = [];
    override async interpret(_prompt: string, _schema: unknown, priority?: 'foreground' | 'background') { this.priorities.push(priority || 'foreground'); return { chineseName: '整理表格', simpleDescription: '帮你整理表格数据', category: 'spreadsheet', tags: [], userPhrases: [], taskTypes: ['spreadsheet'], stage: 'edit', required: false, conditions: [], excludeConditions: [], prerequisites: [], nextSkills: [] }; }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-snapshot-test-')), codex = new SnapshotCodex();
  const skill = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: 'https://github.com/example/skills/blob/fixed/tools/SKILL.md', contentHash: 'one', interpretationStatus: 'pending' as const };
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), codex, catalogFetch: async () => json({ schemaVersion: 1, skills: [skill] }) });
  try {
    bridge.store.state.sources = []; bridge.store.state.lastDiscoveryAt = new Date().toISOString();
    await bridge.tick(); assert.deepEqual(codex.priorities, ['background']); assert.equal(bridge.store.state.skills.find(item => item.id === skill.id)?.interpretationStatus, 'ready');
    bridge.store.state.publicCatalogSync = { lastAttemptAt: new Date(Date.now() - 7 * 3600000).toISOString(), lastSuccessAt: new Date(Date.now() - 7 * 3600000).toISOString(), error: null };
    await bridge.tick(); assert.deepEqual(codex.priorities, ['background']); assert.equal(bridge.store.state.skills.find(item => item.id === skill.id)?.chineseName, '整理表格');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('failed public sync continues interpretation and retries after 30 minutes; successful sync waits six hours across restarts', async () => {
  class QueueCodex extends LocalCodex {
    calls = 0;
    override async interpret() { this.calls++; return { chineseName: '整理表格', simpleDescription: '帮你整理表格数据', category: 'spreadsheet', tags: [], userPhrases: [], taskTypes: ['spreadsheet'], stage: 'edit', required: false, conditions: [], excludeConditions: [], prerequisites: [], nextSkills: [] }; }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-sync-test-')), path = join(directory, 'state.json'), codex = new QueueCodex();
  let requests = 0, failing = true;
  const catalogFetch: typeof fetch = async () => { requests++; if (failing) throw new Error('公开目录网络中断'); return json({ schemaVersion: 1, skills: [] }); };
  const bridge = await createBridgeServer({ statePath: path, codex, catalogFetch });
  try {
    bridge.store.state.sources = []; bridge.store.state.lastDiscoveryAt = new Date().toISOString();
    bridge.store.state.skills = [{ ...seedSkills[0], id: 'import-pending', contentHash: 'pending-one', interpretationStatus: 'pending' }];
    await bridge.tick(); assert.equal(requests, 1); assert.equal(codex.calls, 1); assert.equal(bridge.store.state.skills[0].interpretationStatus, 'ready');
    assert.ok(bridge.store.state.publicCatalogSync.lastAttemptAt); assert.equal(bridge.store.state.publicCatalogSync.lastSuccessAt, null); assert.match(bridge.store.state.publicCatalogSync.error || '', /网络中断/);
    await bridge.tick(); assert.equal(requests, 1);
    bridge.store.state.publicCatalogSync.lastAttemptAt = new Date(Date.now() - 31 * 60000).toISOString(); failing = false;
    await bridge.tick(); assert.equal(requests, 2); assert.ok(bridge.store.state.publicCatalogSync.lastSuccessAt); assert.equal(bridge.store.state.publicCatalogSync.error, null);
    const restarted = await createBridgeServer({ statePath: path, codex, catalogFetch });
    assert.deepEqual(restarted.store.state.publicCatalogSync, bridge.store.state.publicCatalogSync);
    await restarted.tick(); assert.equal(requests, 2);
    const old = new Date(Date.now() - 7 * 3600000).toISOString(); restarted.store.state.publicCatalogSync = { lastAttemptAt: old, lastSuccessAt: old, error: null };
    await restarted.tick(); assert.equal(requests, 3); assert.equal(codex.calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('paired bridge backups round-trip original data without credentials or resetting usage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'navigator-backup-test-'));
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), pairCode: '123456', codex: new LocalCodex() });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`;
  const headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(`${base}/api/backup`, { headers })).status, 401);
    const paired = await (await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    const authorized = { ...headers, Authorization: `Bearer ${paired.token}` };
    const time = new Date().toISOString();
    bridge.store.state.aiUsage = { day: '2026-10-10', count: 20, pausedUntil: 0, message: '' };
    bridge.store.state.publicCatalogSync = { lastAttemptAt: time, lastSuccessAt: time, error: null };
    bridge.store.state.jobs = [{ id: 'saved-job', sourceId: bridge.store.state.sources[0].id, kind: 'scan', status: 'running', message: '正在检查', processed: 1, total: 2, createdAt: time, updatedAt: time }];
    bridge.store.state.authors = [parseGithubSource('https://github.com/remotion-dev')];
    const backup = await (await fetch(`${base}/api/backup`, { headers: authorized })).json();
    assert.equal(backup.schemaVersion, 1); assert.equal(backup.kind, 'ai-navigator-bridge-backup'); assert.equal(backup.skills[0].skillMarkdown, seedSkills[0].skillMarkdown);
    const exported = JSON.stringify(backup); assert.equal(exported.includes(paired.token), false); assert.equal('aiUsage' in backup, false); assert.equal('pairCode' in backup, false);
    bridge.store.state.skills = []; bridge.store.state.sources = []; bridge.store.state.authors = [];
    backup.aiUsage = { day: '', count: 0 };
    const restored = await fetch(`${base}/api/backup/restore`, { method: 'POST', headers: authorized, body: JSON.stringify({ backup }) });
    assert.equal(restored.status, 200); assert.equal((await restored.json()).restored, true);
    assert.equal(bridge.store.state.skills.length, seedSkills.length); assert.equal(bridge.store.state.authors.length, 1); assert.equal(bridge.store.state.jobs[0].status, 'paused'); assert.equal(bridge.store.state.aiUsage.count, 20);
    assert.deepEqual(bridge.store.state.publicCatalogSync, backup.publicCatalogSync);
    assert.equal((await fetch(`${base}/api/backup/restore`, { method: 'POST', headers: authorized, body: JSON.stringify({ backup: { ...backup, schemaVersion: 999 } }) })).status, 400);
    const invalid = structuredClone(backup); invalid.sources[0].url = 'https://evil.example/private';
    assert.equal((await fetch(`${base}/api/backup/restore`, { method: 'POST', headers: authorized, body: JSON.stringify({ backup: invalid }) })).status, 400);
    const invalidSync = { ...backup, publicCatalogSync: { lastAttemptAt: 'not-a-date', lastSuccessAt: null, error: null } };
    assert.equal((await fetch(`${base}/api/backup/restore`, { method: 'POST', headers: authorized, body: JSON.stringify({ backup: invalidSync }) })).status, 400);
    const persisted = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')); assert.equal(persisted.aiUsage.count, 20); assert.equal(JSON.stringify(persisted).includes(paired.token), false);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
test('unchanged imported markdown reuses its ready AI explanation', async () => {
  class CountingCodex extends LocalCodex {
    calls = 0;
    override async interpret() { this.calls++; return { chineseName: '整理表格', simpleDescription: '帮你整理表格数据', category: 'spreadsheet', tags: [], userPhrases: [], taskTypes: ['spreadsheet'], stage: 'edit', required: false, conditions: [], excludeConditions: [], prerequisites: [], nextSkills: [] }; }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-import-test-')), codex = new CountingCodex();
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), pairCode: '123456', codex });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`, headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  try {
    const paired = await (await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    const authorized = { ...headers, Authorization: `Bearer ${paired.token}` }, markdown = '---\nname: my-sheet\ndescription: Edit spreadsheets\n---\nEdit data.';
    const imported = async (text: string) => (await fetch(`${base}/api/skills/interpret`, { method: 'POST', headers: authorized, body: JSON.stringify({ markdown: text, filename: 'my-sheet/SKILL.md' }) })).json();
    assert.equal((await imported(markdown)).skill.category, '做表格'); assert.equal((await imported(markdown)).skill.interpretationStatus, 'ready'); assert.equal(codex.calls, 1);
    await imported(markdown + '\nNew documented behavior.'); assert.equal(codex.calls, 2);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
test('adding repository and author triggers only their immediate checks', async () => {
  class ImmediateScanner extends GithubSkillScanner {
    scanned: string[] = []; authors: string[] = []; popular = 0;
    override async scan(source: ReturnType<typeof parseGithubSource>) { this.scanned.push(source.id); return { source: { ...source, status: 'complete' as const, lastCheckedAt: new Date().toISOString() }, skills: [], complete: true, processed: 0, total: 0 }; }
    override async discoverAuthor(author: ReturnType<typeof parseGithubSource>) { this.authors.push(author.id); return { sources: [parseGithubSource(`https://github.com/${author.owner}/found`) ], cursor: null }; }
    override async discoverPopular() { this.popular++; return []; }
  }
  const directory = await mkdtemp(join(tmpdir(), 'navigator-add-test-')), scanner = new ImmediateScanner();
  const bridge = await createBridgeServer({ statePath: join(directory, 'state.json'), pairCode: '123456', codex: new LocalCodex(), scanner: () => scanner });
  bridge.server.listen(0, '127.0.0.1'); await once(bridge.server, 'listening');
  const base = `http://127.0.0.1:${(bridge.server.address() as { port: number }).port}`, headers = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  try {
    const paired = await (await fetch(`${base}/api/pair`, { method: 'POST', headers, body: JSON.stringify({ code: '123456' }) })).json();
    const authorized = { ...headers, Authorization: `Bearer ${paired.token}` };
    for (const [collection, url] of [['sources', 'https://github.com/example/skills'], ['authors', 'https://github.com/example']]) assert.equal((await fetch(`${base}/api/${collection}`, { method: 'POST', headers: authorized, body: JSON.stringify({ url }) })).status, 200);
    for (let count = 0; count < 100 && bridge.store.state.jobs.some(job => ['running', 'queued'].includes(job.status)); count++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(scanner.scanned, [parseGithubSource('https://github.com/example/skills').id]); assert.deepEqual(scanner.authors, [parseGithubSource('https://github.com/example').id]); assert.equal(scanner.popular, 0);
    assert.ok(bridge.store.state.sources.some(source => source.url === 'https://github.com/example/found')); assert.equal(bridge.store.state.jobs.filter(job => job.status === 'completed').length, 2);
  } finally { bridge.server.close(); await once(bridge.server, 'close'); await rm(directory, { recursive: true, force: true }); }
});
function json(value: unknown, status = 200, headers: Record<string, string> = {}) { return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }
test('scanner resolves truncated trees and reads skill at fixed commit', async () => {
  const urls: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input); urls.push(url);
    if (url.endsWith('/repos/example/skills')) return json({ id: 42, default_branch: 'main', archived: false });
    if (url.endsWith('/commits/main')) return json({ sha: 'fixed-commit', commit: { committer: { date: new Date().toISOString() } } });
    if (url.endsWith('?recursive=1')) return json({ truncated: true, tree: [] });
    if (url.endsWith('/git/trees/fixed-commit')) return json({ truncated: false, tree: [{ type: 'tree', path: 'tools', sha: 'subtree' }] });
    if (url.endsWith('/git/trees/subtree')) return json({ truncated: false, tree: [{ type: 'blob', path: 'SKILL.md', sha: 'blob-one', size: 100, mode: '100644' }] });
    if (url.includes('raw.githubusercontent.com/example/skills/fixed-commit/tools/SKILL.md')) return new Response('---\nname: tools\ndescription: Create and edit spreadsheets\n---\nCreate a spreadsheet.');
    throw new Error('Unexpected request ' + url);
  };
  const result = await new GithubSkillScanner({ fetch: fetcher }).scan(parseGithubSource('https://github.com/example/skills'));
  assert.equal(result.complete, true); assert.equal(result.skills.length, 1); assert.equal(result.skills[0].name, 'tools'); assert.equal(result.skills[0].interpretationStatus, 'pending'); assert.equal(result.skills[0].contentHash, 'blob-one'); assert.match(result.skills[0].githubUrl, /fixed-commit/); assert.ok(urls.some(url => url.includes('/git/trees/subtree')));
});
test('scanner failures and incomplete snapshots never delete existing skills', async () => {
  const source = parseGithubSource('https://github.com/example/skills');
  const existing = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: source.url + '/blob/old/tools/SKILL.md', contentHash: 'old', maintenanceStatus: 'active' as const };
  let count = 0;
  const fetcher: typeof fetch = async () => { count++; if (count === 1) return json({ id: 42, default_branch: 'main' }); if (count === 2) return json({ sha: 'fixed-commit', commit: { committer: { date: new Date().toISOString() } } }); return json({ message: 'rate limit' }, 429, { 'x-ratelimit-remaining': '0' }); };
  const result = await new GithubSkillScanner({ fetch: fetcher }).scan(source, [existing]);
  assert.equal(result.complete, false); assert.equal(result.skills[0].maintenanceStatus, 'active'); assert.equal(result.source.skillCount, 1); assert.ok(result.source.cursor);
  const resumed = await new GithubSkillScanner({ fetch: async () => json({ message: 'offline' }, 503) }).scan(result.source, result.skills);
  assert.equal(resumed.complete, false); assert.equal(resumed.skills[0].maintenanceStatus, 'active');
  const missing = await new GithubSkillScanner({ fetch: async () => json({}, 404) }).scan(source, [existing]);
  assert.equal(missing.skills[0].maintenanceStatus, 'active'); assert.equal(missing.source.status, 'error');
});
test('complete scan marks an upstream removed path and keeps history data', async () => {
  const source = parseGithubSource('https://github.com/example/skills');
  const existing = { ...seedSkills[0], id: 'github:42:tools/SKILL.md', sourceType: 'github' as const, sourcePath: 'tools/SKILL.md', githubUrl: source.url + '/blob/old/tools/SKILL.md', contentHash: 'old' };
  const fetcher: typeof fetch = async input => { const url = String(input); if (url.endsWith('/repos/example/skills')) return json({ id: 42, default_branch: 'main' }); if (url.endsWith('/commits/main')) return json({ sha: 'fixed', commit: { committer: { date: new Date().toISOString() } } }); return json({ truncated: false, tree: [] }); };
  const result = await new GithubSkillScanner({ fetch: fetcher }).scan(source, [existing]);
  assert.equal(result.complete, true); assert.equal(result.skills.length, 1); assert.equal(result.skills[0].maintenanceStatus, 'removed');
});
test('blocked raw domain falls back to fixed-commit contents and resumes document budget', async () => {
  const markdown = '---\nname: example\ndescription: Work with spreadsheets\n---\nEdit spreadsheets.';
  const fetcher: typeof fetch = async input => {
    const url = String(input);
    if (url.startsWith('https://raw.githubusercontent.com/')) throw new Error('ECONNRESET');
    if (url.endsWith('/repos/example/skills')) return json({ id: 42, default_branch: 'main' });
    if (url.endsWith('/commits/main')) return json({ sha: 'fixed', commit: { committer: { date: new Date().toISOString() } } });
    if (url.includes('/git/trees/')) return json({ truncated: false, tree: [{ type: 'blob', path: 'example/SKILL.md', sha: 'one', mode: '100644' }, { type: 'blob', path: 'second/SKILL.md', sha: 'two', mode: '100644' }] });
    if (url.includes('/contents/') && url.endsWith('?ref=fixed')) return json({ encoding: 'base64', content: Buffer.from(markdown).toString('base64'), size: markdown.length });
    throw new Error('Unexpected request');
  };
  const first = await new GithubSkillScanner({ fetch: fetcher, maxDocuments: 1 }).scan(parseGithubSource('https://github.com/example/skills'));
  assert.equal(first.complete, false); assert.equal(first.skills.length, 1); assert.equal(first.source.skillCount, 1); assert.ok(first.source.cursor);
  const next = await new GithubSkillScanner({ fetch: fetcher, maxDocuments: 1 }).scan(first.source, first.skills);
  assert.equal(next.complete, true); assert.equal(next.skills.length, 2); assert.equal(next.source.cursor, null);
});
