import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isLocalRecommendationMode, normalModeUrl } from '../src/services/RuntimeMode.ts';
import { mergeCatalogCache, readCatalogSnapshot } from '../src/services/CatalogBootstrap.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import { defaultData, validateBackup } from '../src/services/StorageLayer.ts';
import { interpretSkillMarkdown } from '../src/core/SkillInterpreter.ts';
import { interpretLocal } from '../src/core/TaskInterpreter.ts';

test('local recommendation mode is limited to an explicit mode on loopback HTTP origins', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(isLocalRecommendationMode(`http://${host}:8787/?mode=local#/home`), true);
  for (const url of ['http://127.0.0.1:8787/', 'http://127.0.0.1:8787/?mode=ai', 'https://next-step-ai-navigator.francis20080805.chatgpt.site/?mode=local', 'http://localhost.example/?mode=local', 'http://127.0.0.1.example/?mode=local', 'http://192.168.1.3/?mode=local', 'file:///127.0.0.1/?mode=local', 'http://user:secret@localhost:8787/?mode=local', 'not a url']) assert.equal(isLocalRecommendationMode(url), false, url);
});

test('switching to the normal entry keeps the browser storage origin and current page', () => {
  const source = 'http://127.0.0.1:8787/?mode=local&lang=zh#/settings';
  const target = normalModeUrl(source);
  assert.equal(new URL(target).origin, new URL(source).origin);
  assert.equal(new URL(target).hash, '#/settings');
  assert.equal(new URL(target).searchParams.get('lang'), 'zh');
  assert.equal(isLocalRecommendationMode(target), false);
});

test('a new offline browser can bootstrap the full shipped catalog using only its own origin', async () => {
  const contents = await readFile(new URL('../public/catalog-snapshot.json', import.meta.url), 'utf8');
  const snapshot = JSON.parse(contents);
  const calls: string[] = [];
  const fetcher: typeof fetch = async input => { calls.push(String(input)); assert.equal(new URL(String(input)).origin, 'http://127.0.0.1:8787'); return new Response(contents, { headers: { 'Content-Type': 'application/json' } }); };
  const catalog = await readCatalogSnapshot('/catalog-snapshot.json', 'http://127.0.0.1:8787/?mode=local', fetcher);
  assert.deepEqual(calls, ['http://127.0.0.1:8787/catalog-snapshot.json']);
  assert.equal(catalog.length, snapshot.skills.length);
  assert.ok(catalog.length >= 1159);
  assert.ok(catalog.some(skill => skill.interpretationStatus === 'ready' && /[\u3400-\u9fff]/u.test(skill.simpleDescription)));
  assert.deepEqual(mergeCatalogCache(seedSkills, catalog, []).filter(skill => skill.sourceType === 'github'), catalog);
});

test('bootstrapping keeps saved task progress, personal skills, confirmed explanations and preferences', async () => {
  const snapshot = JSON.parse(await readFile(new URL('../public/catalog-snapshot.json', import.meta.url), 'utf8'));
  const catalog = validateBackup({ ...defaultData(), skills: snapshot.skills }).skills;
  const personal = interpretSkillMarkdown('---\nname: my-offline-task\nchineseName: 我的离线能力\nsimpleDescription: 帮我整理自己的材料。\n---\n\nMy private instructions.');
  const confirmed = { ...catalog[0], chineseName: '我确认过的中文说明', interpretationStatus: 'ready' as const };
  const result = interpretLocal('视频已经做好了，只加字幕');
  assert.equal(result.kind, 'task');
  if (result.kind !== 'task') return;
  const older = { ...seedSkills[0], version: 'catalog-1', chineseName: '旧缓存说明' };
  const saved = { ...defaultData(), tasks: [result.task], skills: [personal, confirmed, older], favoriteSkillIds: [personal.id] };
  const before = structuredClone(saved);
  const restored = validateBackup({ ...saved, skills: mergeCatalogCache(seedSkills, catalog, saved.skills) });
  assert.deepEqual(saved, before);
  assert.deepEqual(restored.tasks, before.tasks);
  assert.deepEqual(restored.settings, before.settings);
  assert.deepEqual(restored.favoriteSkillIds, before.favoriteSkillIds);
  assert.deepEqual(restored.skills.find(skill => skill.id === personal.id), personal);
  assert.equal(restored.skills.find(skill => skill.id === confirmed.id)?.chineseName, confirmed.chineseName);
  assert.equal(restored.skills.find(skill => skill.id === older.id)?.version, seedSkills[0].version);
});

test('an unavailable or invalid snapshot is rejected before any saved catalog can be replaced', async () => {
  await assert.rejects(readCatalogSnapshot('/catalog-snapshot.json', 'http://127.0.0.1:8787/', async () => new Response('missing', { status: 404 })), /404/);
  await assert.rejects(readCatalogSnapshot('/catalog-snapshot.json', 'http://127.0.0.1:8787/', async () => new Response('{"skills":[{"id":"broken"}]}')), /能力数据不完整/);
  await assert.rejects(readCatalogSnapshot('file:///catalog.json', 'http://127.0.0.1:8787/'), /有效/);
});
