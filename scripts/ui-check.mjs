// Browser plugin not available; bundled Playwright with an isolated Edge context.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require(path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const { chromium } = playwright;
const output = process.env.NEXTSTEP_QA_OUTPUT ?? path.resolve('.data/qa');
const base = 'http://127.0.0.1:5173';
const pairCode = process.argv.find(value => value.startsWith('--pair-code='))?.split('=')[1];
await mkdir(output, { recursive: true });
const edge = path.join(process.env['ProgramFiles(x86)'] ?? process.env.ProgramFiles ?? '', 'Microsoft/Edge/Application/msedge.exe');
const browser = await chromium.launch({ headless: true, ...(existsSync(edge) ? { executablePath: edge } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, locale: 'zh-CN', timezoneId: 'Asia/Hong_Kong', acceptDownloads: true });
await context.grantPermissions(['clipboard-read', 'clipboard-write']);
const page = await context.newPage();
const consoleErrors = []; const pageErrors = []; const checks = []; const failedResponses = [];
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
page.on('pageerror', error => pageErrors.push(error.message));
page.on('response', response => { if (response.status() >= 400) failedResponses.push({ url: response.url(), status: response.status() }); });
page.on('dialog', dialog => dialog.accept());
page.setDefaultTimeout(12000);
async function check(name, action) {
  try { await action(); checks.push({ name, status: 'pass' }); console.log(`PASS ${name}`); }
  catch (error) { checks.push({ name, status: 'fail', message: error.message }); console.log(`FAIL ${name}: ${error.message}`); await page.screenshot({ path: path.join(output, `failure-${checks.length}.png`), fullPage: false }); throw error; }
}
async function route(id) { await page.goto(`${base}/#/${id}`); await page.locator('.loading-state').waitFor({ state: 'hidden' }); }
async function screenshot(name) { await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false }); }
async function dbState() {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('next-step-navigator', 1);
    request.onsuccess = () => { const read = request.result.transaction('app').objectStore('app').get('state'); read.onsuccess = () => { resolve(read.result); request.result.close(); }; read.onerror = () => reject(read.error); };
    request.onerror = () => reject(request.error);
  }));
}
async function waitForSave(test) { await page.waitForFunction(async testSource => { const test = new Function('data', `return (${testSource})(data)`); const request = indexedDB.open('next-step-navigator', 1); return new Promise(resolve => { request.onsuccess = () => { const db = request.result; const read = db.transaction('app').objectStore('app').get('state'); read.onsuccess = () => { resolve(test(read.result)); db.close(); }; }; request.onerror = () => resolve(false); }); }, test.toString()); }

try {
  await check('页面身份、首页非空、无预置假任务', async () => {
    await route('home'); assert.match(await page.title(), /下一步/); assert.equal(await page.locator('h1').innerText(), '你今天想让 AI 帮你做什么？'); assert.equal(await page.locator('.workflow').count(), 0); assert.equal(await page.locator('vite-error-overlay').count(), 0); await screenshot('desktop-home-empty');
  });
  await check('笼统视频输入原地澄清', async () => {
    await page.getByRole('textbox', { name: '你今天想让 AI 帮你做什么？' }).fill('我要做视频'); await page.getByRole('button', { name: '帮我安排下一步' }).click(); await page.getByRole('heading', { name: '你想做哪一种视频？' }).waitFor(); await screenshot('desktop-clarification'); await page.getByRole('button', { name: '短视频', exact: true }).click(); await page.locator('.workflow').waitFor(); assert.equal(await page.locator('.workflow-step').count(), 2);
  });
  await check('完整视频条件、顺序、明确排除', async () => {
    await page.getByRole('button', { name: '开始新任务', exact: true }).click(); await page.getByRole('textbox', { name: '你今天想让 AI 帮你做什么？' }).fill('我要从零做一个30秒带字幕的短视频，最后导出1080x1920竖屏，不要背景音乐。'); await page.getByRole('button', { name: '帮我安排下一步' }).click(); await page.locator('.workflow').waitFor(); const text = await page.locator('.workflow').innerText(); assert.match(text, /remotion-create/); assert.match(text, /remotion-captions/); assert.match(text, /remotion-render/); assert.doesNotMatch(text, /remotion-multimedia/); assert.equal(await page.locator('.clarification').count(), 0); assert.equal(await page.locator('.workflow-step').count(), 3); await screenshot('desktop-workflow');
  });
  await check('步骤完成与进度补充保留原始任务', async () => {
    await page.getByRole('button', { name: '这步做好了' }).click(); assert.match(await page.locator('.step-current').innerText(), /给视频加字幕/); await page.getByRole('textbox', { name: '补充当前进度' }).fill('视频已经做好了，现在还没字幕。'); await page.getByRole('button', { name: '更新下一步' }).click(); await page.waitForFunction(() => document.querySelector('.original-request')?.textContent.includes('视频已经做好了')); assert.match(await page.locator('.step-current').innerText(), /给视频加字幕/); assert.match(await page.locator('.completed-steps').innerText(), /已完成 1 步/); assert.equal((await dbState()).tasks.length, 2); await waitForSave(data => data?.tasks[0]?.inputs.length === 2);
  });
  await check('复制文本保留约束与已完成步骤', async () => {
    await page.getByRole('button', { name: '复制给 Codex', exact: true }).click(); const text = await page.evaluate(() => navigator.clipboard.readText()); assert.match(text, /字幕/); assert.match(text, /明确不要：背景音乐/); assert.match(text, /已经完成：做视频/); assert.match(text, /1080×1920/);
  });
  await check('开始任务生成可复制文本并保存本地状态', async () => {
    await page.getByRole('button', { name: /^(开始|继续)这个任务$/ }).click(); await page.getByRole('dialog', { name: '任务已经准备好' }).waitFor(); assert.match(await page.getByRole('dialog').innerText(), /粘贴到 Codex/); await page.getByRole('button', { name: '回到步骤' }).click(); await waitForSave(data => data?.tasks[0]?.status === 'started'); await page.getByRole('button', { name: '收藏任务', exact: true }).click(); await waitForSave(data => data?.tasks[0]?.favorite === true);
  });
  await check('刷新恢复历史并继续当前步骤', async () => {
    await route('history'); assert.equal(await page.locator('.history-card').count(), 2); await page.reload(); await page.locator('.history-card').first().waitFor(); await page.locator('.history-card').first().getByRole('button', { name: '继续', exact: true }).click(); await page.locator('.step-current').waitFor(); assert.match(await page.locator('.step-current').innerText(), /给视频加字幕/); assert.match(await page.locator('.completed-steps').innerText(), /已完成 1 步/);
  });
  await check('离线导入不得冒充中文理解，人工确认后入库', async () => {
    await route('library'); await page.getByRole('button', { name: '导入能力', exact: true }).click(); await page.getByRole('textbox', { name: '原始内容', exact: true }).fill('---\nname: qa-photo-cleanup\ndescription: Removes dust marks from product photos while preserving logos.\n---\n\nKeep the product and logo intact, remove dust marks only.'); await page.getByRole('button', { name: '理解并生成中文解释', exact: true }).click(); await page.getByRole('textbox', { name: '中文名称', exact: true }).waitFor(); assert.equal(await page.getByRole('textbox', { name: '中文名称', exact: true }).inputValue(), ''); assert.equal(await page.getByRole('button', { name: '加入能力库', exact: true }).isDisabled(), true); await screenshot('desktop-import-pending'); await page.getByRole('textbox', { name: '中文名称', exact: true }).fill('清理产品照片灰尘'); await page.getByRole('textbox', { name: '一句话用途', exact: true }).fill('清除产品照片中的灰尘痕迹，同时保留产品和商标。'); await page.getByRole('checkbox', { name: '我已确认中文名称和用途准确' }).check(); await page.getByRole('button', { name: '加入能力库', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'hidden' }); await page.getByRole('textbox', { name: '搜索能力', exact: true }).fill('清理产品照片'); await page.getByRole('heading', { name: '清理产品照片灰尘', exact: true }).waitFor(); await waitForSave(data => data?.skills.some(skill => skill.name === 'qa-photo-cleanup' && skill.interpretationStatus === 'ready'));
  });
  await check('能力收藏、详情抽屉、任务收藏都可使用', async () => {
    await page.getByRole('button', { name: '收藏清理产品照片灰尘', exact: true }).click(); await page.getByRole('button', { name: '详细信息', exact: true }).click(); await page.getByRole('dialog', { name: '清理产品照片灰尘' }).waitFor(); assert.equal(await page.locator('.modal-drawer').count(), 1); await screenshot('desktop-skill-detail'); await page.getByRole('button', { name: '关闭', exact: true }).click(); await waitForSave(data => data?.favoriteSkillIds.length === 1); await route('favorites'); assert.equal(await page.locator('.history-card').count(), 1); await page.getByRole('tab', { name: '常用能力' }).click(); await page.getByRole('heading', { name: '清理产品照片灰尘' }).waitFor();
  });
  let backupPath;
  await check('导出备份包含历史、收藏和人工确认能力', async () => {
    await route('settings'); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '导出备份', exact: true }).click(); const download = await pending; backupPath = path.join(output, 'qa-backup.json'); await download.saveAs(backupPath); const backup = JSON.parse(await readFile(backupPath, 'utf8')); assert.equal(backup.tasks.length, 2); assert.equal(backup.favoriteSkillIds.length, 1); assert.equal(backup.skills.find(skill => skill.name === 'qa-photo-cleanup').interpretationStatus, 'ready');
  });
  await check('无效备份拒绝恢复并保留原有数据', async () => {
    await page.getByLabel('选择应用备份文件', { exact: true }).setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"schemaVersion":0}') }); await page.locator('.settings-page .error-message').waitFor(); assert.equal((await dbState()).tasks.length, 2); assert.match(await page.locator('.settings-page .error-message').innerText(), /格式|版本/);
  });
  await check('有效备份恢复已删除记录', async () => {
    await route('history'); await page.locator('.history-card').first().getByRole('button', { name: /删除任务/ }).click(); await page.waitForFunction(() => document.querySelectorAll('.history-card').length === 1); await waitForSave(data => data?.tasks.length === 1); await route('settings'); await page.getByLabel('选择应用备份文件', { exact: true }).setInputFiles(backupPath); await page.getByRole('status').filter({ hasText: '备份已恢复' }).waitFor(); await route('history'); assert.equal(await page.locator('.history-card').count(), 2);
  });
  await check('未配对不能伪装连接、错误连接码保留错误提示', async () => {
    await route('settings'); assert.equal(await page.getByText('AI 已连接', { exact: true }).count(), 0); await page.getByRole('switch', { name: /优先使用 AI/ }).uncheck(); await page.getByRole('textbox', { name: '连接码', exact: true }).fill('000000'); await page.getByRole('button', { name: '连接 Codex', exact: true }).click(); await page.locator('.settings-page .error-message').waitFor(); assert.equal(await page.getByText('AI 已连接', { exact: true }).count(), 0); await screenshot('desktop-connection-error');
  });
  if (pairCode) await check('真实单次配对、来源读取、断开不会删除本地数据', async () => {
    await page.getByRole('textbox', { name: '连接码', exact: true }).fill(pairCode); await page.getByRole('button', { name: '连接 Codex', exact: true }).click(); await page.getByText('AI 已连接', { exact: true }).waitFor(); console.log('PAIR_CODE_CONSUMED'); await route('sources'); await page.getByRole('heading', { name: '已添加的仓库', exact: true }).waitFor(); await page.waitForTimeout(600); await screenshot('desktop-sources-connected'); await route('settings');
    const checksEnabled = await page.getByRole('switch', { name: /定期检查来源更新/ }).isChecked(); if (checksEnabled) { await page.getByRole('switch', { name: /定期检查来源更新/ }).click(); await page.waitForFunction(() => [...document.querySelectorAll('input[role="switch"]')].at(1)?.checked === false); }
    await page.getByText('高级设置', { exact: true }).click(); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '导出本机目录', exact: true }).click(); const download = await pending; const bridgePath = path.join(output, 'qa-bridge-backup.json'); await download.saveAs(bridgePath); const bridgeBackup = JSON.parse(await readFile(bridgePath, 'utf8')); assert.equal(bridgeBackup.kind, 'ai-navigator-bridge-backup'); assert.equal(bridgeBackup.schemaVersion, 1); assert.equal('token' in bridgeBackup, false); assert.equal('code' in bridgeBackup, false); await page.getByLabel('选择本机目录备份文件', { exact: true }).setInputFiles(backupPath); await page.locator('.settings-page .error-message').waitFor(); assert.match(await page.locator('.settings-page .error-message').innerText(), /本机目录备份/);
    let restored = false;
    for (let attempt = 0; attempt < 45 && !restored; attempt++) {
      await page.getByLabel('选择本机目录备份文件', { exact: true }).setInputFiles(bridgePath);
      await page.waitForFunction(() => Boolean([...document.querySelectorAll('[role="status"]')].find(node => node.textContent.includes('本机目录已恢复'))) || Boolean(document.querySelector('.settings-page .error-message')));
      restored = await page.getByRole('status').filter({ hasText: '本机目录已恢复' }).count() > 0;
      if (!restored) { assert.match(await page.locator('.settings-page .error-message').innerText(), /正在|等待|任务|检查|忙/); await page.waitForTimeout(1000); }
    }
    assert.equal(restored, true, '本机目录恢复仍被后台任务阻止'); console.log('REAL_BRIDGE_BACKUP_RESTORE_PASS'); assert.equal((await dbState()).tasks.length, 2); await screenshot('desktop-bridge-backup'); if (checksEnabled) { await page.getByRole('switch', { name: /定期检查来源更新/ }).click(); await page.waitForFunction(() => [...document.querySelectorAll('input[role="switch"]')].at(1)?.checked === true); }
    await page.getByRole('button', { name: '断开连接', exact: true }).click(); await page.getByRole('button', { name: '连接 Codex', exact: true }).waitFor(); assert.equal((await dbState()).tasks.length, 2);
  });
  await check('桌面六页没有横向溢出', async () => {
    for (const id of ['home', 'history', 'library', 'sources', 'favorites', 'settings']) { await route(id); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${id} desktop overflow`); await screenshot(`desktop-${id}`); }
  });
  await check('手机六页没有横向溢出，更多导航可到达高级页面', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const id of ['home', 'history', 'library', 'sources', 'favorites', 'settings']) { await route(id); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${id} mobile overflow`); await screenshot(`mobile-${id}`); }
    await page.getByRole('button', { name: '打开更多页面', exact: true }).click(); await page.getByRole('dialog', { name: '更多', exact: true }).getByRole('link', { name: '能力来源', exact: true }).click(); await page.getByRole('heading', { name: '能力来源', exact: true }).waitFor(); assert.equal(await page.getByRole('dialog').count(), 0);
  });
  await check('手机流程操作可见、正常更新', async () => {
    await route('history'); await page.locator('.history-card').first().getByRole('button', { name: '继续', exact: true }).click(); await page.locator('.step-current').waitFor(); await page.getByRole('button', { name: '这步做好了' }).click(); assert.match(await page.locator('.step-current').innerText(), /导出视频/); await screenshot('mobile-workflow');
  });
  await check('320px窄屏六页没有横向溢出', async () => {
    await page.setViewportSize({ width: 320, height: 740 }); for (const id of ['home', 'history', 'library', 'sources', 'favorites', 'settings']) { await route(id); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${id} narrow overflow`); }
  });
  let restoredBridge = 0;
  const bridgeFixture = { schemaVersion: 1, kind: 'ai-navigator-bridge-backup', exportedAt: new Date().toISOString(), skills: [], sources: [], authors: [], jobs: [], settings: { automaticChecks: false }, lastDiscoveryAt: null };
  await check('配对存在但AI不可用时仍能维护来源（受控API契约）', async () => {
    await page.route('http://127.0.0.1:8787/api/**', async interception => {
      const endpoint = new URL(interception.request().url()).pathname;
      let body;
      if (endpoint === '/api/status') body = { connected: false, codexAvailable: false, authMode: 'none', message: 'AI 未就绪', backgroundEnabled: false, interpretedToday: 0 };
      else if (endpoint === '/api/backup') body = bridgeFixture;
      else if (endpoint === '/api/backup/restore') { assert.equal(interception.request().postDataJSON().backup.kind, bridgeFixture.kind); restoredBridge++; body = { restored: true, skillCount: 0, sourceCount: 0, authorCount: 0 }; }
      else if (['/api/catalog', '/api/sources', '/api/authors', '/api/jobs'].includes(endpoint)) body = [];
      else if (endpoint === '/api/settings') body = {};
      else throw new Error(`Unexpected API call in no-AI fixture: ${endpoint}`);
      await interception.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': base, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS' }, body: JSON.stringify(body) });
    });
    await page.addInitScript(() => sessionStorage.setItem('next-step-bridge-session', 'isolated-qa-fixture-token'));
    await page.evaluate(() => sessionStorage.setItem('next-step-bridge-session', 'isolated-qa-fixture-token')); await page.reload();
    await route('sources'); await page.getByRole('heading', { name: '已添加的仓库', exact: true }).waitFor(); assert.equal(await page.getByRole('button', { name: '添加来源', exact: true }).isDisabled(), false); await route('settings'); assert.equal(await page.getByText('AI 已连接', { exact: true }).count(), 0); await page.getByText('本机服务已配对，AI 暂未就绪', { exact: true }).waitFor();
  });
  await check('独立本机目录备份导出/恢复，拒绝混用浏览器备份（受控API契约）', async () => {
    await page.getByText('高级设置', { exact: true }).click(); const pending = page.waitForEvent('download'); await page.getByRole('button', { name: '导出本机目录', exact: true }).click(); const downloaded = await pending; const fixturePath = path.join(output, 'qa-bridge-contract-backup.json'); await downloaded.saveAs(fixturePath); const backup = JSON.parse(await readFile(fixturePath, 'utf8')); assert.equal(backup.kind, bridgeFixture.kind); assert.equal('token' in backup, false);
    await page.getByLabel('选择本机目录备份文件', { exact: true }).setInputFiles(backupPath); await page.locator('.settings-page .error-message').waitFor(); assert.match(await page.locator('.settings-page .error-message').innerText(), /本机目录备份/); assert.equal(restoredBridge, 0);
    await page.getByLabel('选择本机目录备份文件', { exact: true }).setInputFiles(fixturePath); await page.getByRole('status').filter({ hasText: '本机目录已恢复' }).waitFor(); assert.equal(restoredBridge, 1); assert.equal((await dbState()).tasks.length, 2);
  });
  assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
  console.log(JSON.stringify({ checks, pageErrors, consoleErrors, failedResponses, screenshotDirectory: output }, null, 2));
} finally { await context.close(); await browser.close(); }
