import test from 'node:test';
import assert from 'node:assert/strict';
import type { TaskRecord } from '../src/domain/types.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import { interpretLocal, planWorkflowFromIntent } from '../src/core/TaskInterpreter.ts';
import { buildCodexPrompt, completeStep, planWorkflow } from '../src/core/WorkflowPlanner.ts';
import { searchSkills } from '../src/core/SearchEngine.ts';
import { interpretSkillMarkdown } from '../src/core/SkillInterpreter.ts';

function task(input: string, previous?: TaskRecord): TaskRecord {
  const result = interpretLocal(input, previous, seedSkills);
  if (result.kind !== 'task') throw new Error(`Unexpected clarification for ${input}`);
  return result.task;
}
function actions(record: TaskRecord): string[] { return record.steps.map((step) => step.action); }

test('vague video and spreadsheet requests ask accessible questions', () => {
  const video = interpretLocal('我要做视频');
  assert.equal(video.kind, 'clarification');
  if (video.kind === 'clarification') assert.ok(video.clarification.options.includes('口播视频'));
  const sheet = interpretLocal('我要做表格');
  assert.equal(sheet.kind, 'clarification');
  if (sheet.kind === 'clarification') assert.ok(sheet.clarification.options.includes('库存表'));
  assert.equal(task('我要做表格，库存表').intent.subtype, '库存表');
});

test('complete video request preserves parameters without extra questions', () => {
  const record = task('用5张产品图片做一个30秒产品宣传视频，加字幕和背景音乐，最后导出1080x1920竖屏');
  assert.deepEqual(actions(record), ['video.create', 'video.materials', 'video.captions', 'video.export']);
  assert.deepEqual(record.intent.parameters, { duration: '30秒', resolution: '1080×1920', quantity: '5张图片', orientation: '竖屏' });
  assert.equal(record.title, '制作产品宣传视频');
  assert.match(record.originalInput, /1080x1920/);
  assert.ok(record.steps.every((step) => step.skillId));
});

test('explicit negation excludes captions but retains music', () => {
  const record = task('剪一个短视频，不要字幕，但要背景音乐');
  assert.equal(record.intent.requirements.captions, 'excluded');
  assert.equal(record.intent.requirements.music, 'required');
  assert.ok(!actions(record).includes('video.captions'));
  assert.ok(actions(record).includes('video.materials'));
  assert.match(buildCodexPrompt(record), /明确不要：字幕/);
});

test('existing video with only captions avoids recreation and media extras', () => {
  const record = task('我已经有视频，只需要加字幕');
  assert.deepEqual(actions(record), ['video.captions', 'video.export']);
  assert.ok(record.intent.hasExistingOutput);
  assert.equal(record.steps[0].skillName, 'remotion-captions');
  assert.deepEqual(actions(task('我要给视频加字幕')), ['video.captions', 'video.export']);
});

test('missing subtitles differs from unwanted subtitles', () => {
  assert.ok(actions(task('视频已经做好了，现在还没字幕')).includes('video.captions'));
  const record = task('视频已经做好了，不需要字幕，只加背景音乐');
  assert.ok(!actions(record).includes('video.captions'));
  assert.deepEqual(actions(record), ['video.materials', 'video.export']);
});

test('follow-up completion preserves task and step IDs and initial parameters', () => {
  const initial = task('我要从零做一个30秒带字幕的短视频');
  const updated = task('视频已经做好了，现在还没字幕', initial);
  assert.equal(updated.id, initial.id);
  assert.equal(updated.originalInput, initial.originalInput);
  assert.equal(updated.inputs.length, 2);
  assert.equal(updated.intent.parameters.duration, '30秒');
  assert.equal(updated.steps.find((step) => step.action === 'video.create')?.id, initial.steps[0].id);
  assert.equal(updated.steps[0].status, 'completed');
  assert.equal(updated.steps.find((step) => step.status === 'pending')?.action, 'video.captions');
  assert.ok(!buildCodexPrompt(updated).includes('1. 做视频'));
});

test('unfinished output is not incorrectly considered complete', () => {
  const record = task('视频还没做好，我要从零做带字幕的短视频');
  assert.equal(record.intent.hasExistingOutput, false);
  assert.equal(record.steps[0].action, 'video.create');
  assert.equal(record.steps[0].status, 'pending');
});

test('sales PPT starts with actual source data, then charts before presentation', () => {
  const record = task('帮老板做一份上个月销售数据PPT');
  assert.deepEqual(actions(record), ['data.prepare', 'data.organize', 'data.analyze', 'data.charts', 'presentation.create', 'presentation.check']);
  assert.equal(record.steps[0].skillId, null);
  assert.deepEqual(record.intent.missingMaterials, ['上个月销售数据']);
  assert.equal(record.intent.useCloud, false);
  assert.ok(!record.steps.some((step) => step.skillName === 'google-drive'));
  assert.match(buildCodexPrompt(record), /不要虚构资料/);
});

test('existing sales data removes manual preparation; one skill can serve multiple steps', () => {
  const record = task('我有一个月销售数据，要做成统计表、图表和PPT');
  assert.ok(!actions(record).includes('data.prepare'));
  assert.ok(actions(record).includes('spreadsheet.create'));
  assert.ok(actions(record).includes('presentation.create'));
  const spreadsheetSteps = record.steps.filter((step) => step.skillName === 'Spreadsheets');
  assert.ok(spreadsheetSteps.length >= 3);
  assert.equal(new Set(spreadsheetSteps.map((step) => step.id)).size, spreadsheetSteps.length);
});

test('Figma conversion uses existing design, then creation and checking', () => {
  const record = task('我有Figma设计稿，要做成网页，做好后检查手机和电脑显示');
  assert.deepEqual(actions(record), ['website.designread', 'website.create', 'website.check']);
  assert.equal(record.steps[0].skillName, 'figma-design-to-code');
  assert.ok(!record.steps.some((step) => step.skillName === 'figma-create-new-file'));
});

test('existing broken website starts with debugging rather than a rebuild', () => {
  const record = task('网页做好了，但是手机打开错位，按钮点不了');
  assert.deepEqual(actions(record), ['website.debug']);
  assert.equal(record.steps[0].skillName, 'frontend-testing-debugging');
});

test('resolved website problems advance to checking and preserve completed history', () => {
  let record = task('我要做网页');
  record = completeStep(record, record.steps[0].id);
  const debug = task('网页按钮点不了', record);
  assert.equal(debug.steps[0].id, record.steps[0].id);
  assert.equal(debug.steps[0].status, 'completed');
  const fixed = task('网页问题已经修好了，请检查手机和电脑显示', debug);
  assert.equal(fixed.intent.hasError, false);
  assert.equal(fixed.steps.find((step) => step.action === 'website.debug')?.status, 'completed');
  assert.equal(fixed.steps.find((step) => step.status === 'pending')?.action, 'website.check');
});

test('AI schema parameters and unspecified follow-ups retain earlier constraints', () => {
  const previous = task('用5张图片做一个30秒带字幕的视频');
  const intent = { ...previous.intent, goals: [], requirements: { captions: 'unspecified' as const }, parameters: { duration: '', resolution: '', quantity: '', format: 'mp4', orientation: '' } };
  const updated = planWorkflowFromIntent('视频已做好', intent, previous);
  assert.equal(updated.intent.parameters.duration, '30秒');
  assert.equal(updated.intent.parameters.quantity, '5张图片');
  assert.equal(updated.intent.requirements.captions, 'required');
  assert.match(buildCodexPrompt(updated), /输出格式：mp4/);
  assert.throws(() => planWorkflowFromIntent('未知任务', { ...intent, category: 'other', goals: [] }), /暂时还无法拆解/);
});

test('stock workflow and budget negation use appropriate spreadsheet actions', () => {
  assert.deepEqual(actions(task('我要做库存表')), ['spreadsheet.create', 'data.organize', 'spreadsheet.quantity', 'data.analyze']);
  assert.ok(!actions(task('我要做公司预算表，不需要图表')).includes('data.charts'));
  assert.equal(task('我要做公司每月收支表').steps.at(-1)?.optional, true);
});

test('cloud template routes differ from new local and new Google PPT', () => {
  assert.equal(task('我要做PPT').steps[0].skillName, 'Presentations');
  assert.equal(task('我要从零做Google Slides PPT').steps[0].skillName, 'Presentations');
  assert.equal(task('我要修改现有Google Slides模板PPT').steps[0].skillName, 'google-slides');
  assert.equal(task('我要做销售表格').steps[0].skillName, 'Spreadsheets');
  assert.equal(task('我有Google Sheets在线表格，要整理销售数据').steps[0].skillName, 'google-sheets');
});

test('email calendar and GitHub service capabilities are not fake skill files', () => {
  for (const name of ['Gmail', 'Google Calendar', 'GitHub']) assert.equal(seedSkills.find((skill) => skill.name === name)?.capabilityKind, 'connector');
  const record = task('我要给客户发邮件');
  assert.equal(record.steps[0].capabilityKind, 'connector');
  assert.match(buildCodexPrompt(record), /需要连接的服务：Gmail/);
  assert.ok(!buildCodexPrompt(record).includes('建议使用 Skill：Gmail'));
});

test('unknown task asks for a concrete result and does not invent a skill', () => {
  assert.equal(interpretLocal('帮我搞定一下').kind, 'clarification');
  assert.throws(() => interpretLocal('   '), /先告诉我/);
  assert.equal(interpretLocal('已有东西，只需要整理它们').kind, 'clarification');
});

test('PDF tables are read before table creation and analysis', () => {
  const record = task('把PDF提取成Excel表格');
  assert.equal(record.steps[0].action, 'pdf.edit');
  assert.ok(actions(record).includes('spreadsheet.create'));
  assert.equal(record.steps[0].skillName, 'pdf');
});

test('search supports oral Chinese, English, category and empty input', () => {
  assert.equal(searchSkills('网页按钮坏了', seedSkills)[0].name, 'frontend-testing-debugging');
  assert.equal(searchSkills('Figma转网页', seedSkills)[0].name, 'figma-design-to-code');
  assert.ok(searchSkills('销售表格', seedSkills).some((skill) => skill.name === 'Spreadsheets'));
  assert.ok(searchSkills('captions', seedSkills).some((skill) => skill.name === 'remotion-captions'));
  assert.ok(searchSkills('', seedSkills, '视频').every((skill) => skill.category === '视频'));
});

test('markdown import parses YAML multiline descriptions and preserves original text', () => {
  const markdown = '---\nname: new-tool\ndescription: >\n  An amazing spreadsheet tool.\n  Supports formulas.\nversion: 2\n---\n\n# Example\n';
  const imported = interpretSkillMarkdown(markdown, 'new-tool/SKILL.md');
  assert.equal(imported.name, 'new-tool');
  assert.equal(imported.skillMarkdown, markdown);
  assert.match(imported.description, /Supports formulas/);
  assert.equal(imported.version, '2');
  assert.equal(imported.interpretationStatus, 'pending');
  assert.equal(imported.capabilityKind, 'skill');
  assert.throws(() => interpretSkillMarkdown('---\nname: [unclosed\n---'), /./);
});

test('known imports use honest curated explanation, pending imports do not enter recommendations', () => {
  const known = interpretSkillMarkdown('---\nname: remotion-captions\ndescription: Transcribing captions\n---\nContent');
  assert.equal(known.chineseName, '给视频加字幕');
  assert.equal(known.interpretationStatus, 'ready');
  const unknown = interpretSkillMarkdown('---\nname: broad-tool\ndescription: Do everything\n---\nContent');
  assert.equal(unknown.interpretationStatus, 'pending');
  assert.ok(!planWorkflow(task('做短视频加字幕').intent, [unknown]).some((step) => step.skillId));
  const custom = interpretSkillMarkdown('---\nname: my-caption-tool\ndescription: Custom helper\nchineseName: 给视频加字幕\nsimpleDescription: 为视频生成字幕\ncategory: 视频\ntaskTypes: [video]\n---\nCustom instructions');
  assert.deepEqual(custom.taskTypes, ['video']);
  assert.equal(custom.category, '视频');
  assert.equal(custom.pluginId, '');
  assert.equal(planWorkflow(task('已有视频只想加字幕').intent, [custom])[0].skillId, custom.id);
});

test('manual completion advances status without mutating the original record', () => {
  const initial = task('视频已经做好了，只需要加字幕');
  const advanced = completeStep(initial, initial.steps[0].id);
  assert.equal(initial.steps[0].status, 'pending');
  assert.equal(advanced.steps[0].status, 'completed');
  assert.equal(advanced.status, 'started');
  assert.equal(completeStep(advanced, advanced.steps[1].id).status, 'completed');
  assert.throws(() => completeStep(initial, initial.steps[1].id), /前面的步骤/);
});

test('removed and unavailable skills are not recommended', () => {
  const catalog = seedSkills.map((skill) => skill.name === 'remotion-captions' ? { ...skill, maintenanceStatus: 'removed' as const } : skill);
  const result = interpretLocal('已有视频只想加字幕', undefined, catalog);
  assert.equal(result.kind, 'task');
  if (result.kind === 'task') assert.equal(result.task.steps.find((step) => step.action === 'video.captions')?.skillId, null);
});
