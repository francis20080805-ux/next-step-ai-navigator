import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubSkillScanner, popularQueries, parseGithubSource } from '../server/GithubSkillScanner.ts';
import { mergeSkills } from '../src/services/SkillRepository.ts';
import { validateBackup, defaultData } from '../src/services/StorageLayer.ts';
import { interpretSkillMarkdown } from '../src/core/SkillInterpreter.ts';
import { buildCodexPrompt } from '../src/core/WorkflowPlanner.ts';
import { interpretLocal } from '../src/core/TaskInterpreter.ts';

test('popular discovery ranks stars across themes and excludes private forks', async () => {
  const groups = [
    [{ html_url: 'https://github.com/example/small', stargazers_count: 10 }, { html_url: 'https://github.com/example/fork', fork: true, stargazers_count: 9999 }],
    [{ html_url: 'https://github.com/example/big', stargazers_count: 500 }, { html_url: 'https://github.com/example/private', private: true, stargazers_count: 2000 }],
    [{ html_url: 'https://github.com/example/small', stargazers_count: 12 }],
  ];
  let index = 0;
  const fetcher = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('sort'), 'stars');
    assert.equal(url.searchParams.get('order'), 'desc');
    assert.equal(url.searchParams.get('q'), popularQueries[index]);
    return new Response(JSON.stringify({ items: groups[index++] }), { headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const sources = await new GithubSkillScanner({ fetch: fetcher }).discoverPopular();
  assert.deepEqual(sources.map(source => [source.repo, source.stars]), [['big', 500], ['small', 12]]);
});

test('actual YAML skill names remain intact even when they contain spaces or leading hyphens', () => {
  for (const name of ['Ashby Automation', '-21risk-automation']) {
    const skill = interpretSkillMarkdown(`---\nname: ${name}\ndescription: Discover connected tools.\n---\n# Tools`, 'composio-skills/service/SKILL.md');
    assert.equal(skill.name, name);
    assert.equal(skill.sourcePath, 'composio-skills/service/SKILL.md');
  }
});

test('repository stars survive fixed-commit scanning, Chinese cache reuse and backup recovery', async () => {
  const markdown = '---\nname: tracked-skill\ndescription: A real workflow.\n---\n# Workflow';
  const fetcher: typeof fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'raw.githubusercontent.com') return new Response(markdown);
    const body = url.pathname.endsWith('/commits/main') ? { sha: 'fixed-commit', commit: { committer: { date: '2026-10-12T00:00:00Z' } } }
      : url.pathname.endsWith('/git/trees/fixed-commit') ? { truncated: false, tree: [{ path: 'tracked/SKILL.md', sha: 'fixed-content', type: 'blob', mode: '100644' }] }
      : { id: 42, default_branch: 'main', stargazers_count: 7404 };
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  };
  const result = await new GithubSkillScanner({ fetch: fetcher }).scan(parseGithubSource('https://github.com/example/ranked'));
  assert.equal(result.complete, true); assert.equal(result.source.stars, 7404);
  const scanned = result.skills[0]; assert.equal(scanned.githubStars, 7404); assert.match(scanned.githubUrl, /fixed-commit/);
  const interpreted = { ...scanned, chineseName: '已整理的中文', simpleDescription: '保留人工解释', interpretationStatus: 'ready' as const, githubStars: 100 };
  const cached = mergeSkills([interpreted], [scanned])[0];
  assert.equal(cached.githubStars, 7404); assert.equal(cached.chineseName, interpreted.chineseName); assert.equal(cached.interpretationStatus, 'ready');
  assert.equal(validateBackup({ ...defaultData(), skills: [cached] }).skills[0].githubStars, 7404);
  assert.throws(() => validateBackup({ ...defaultData(), skills: [{ ...cached, githubStars: -1 }] }), /星数/);
});

test('copied commands quote source paths for names that cannot be invoked with dollar syntax', () => {
  const result = interpretLocal('视频已经做好了，只需要加字幕');
  assert.equal(result.kind, 'task');
  if (result.kind !== 'task') return;
  const step = result.task.steps.find(item => item.status === 'pending')!;
  const skill = { ...interpretSkillMarkdown('---\nname: Captions Automation\ndescription: Check subtitles.\n---\n# Captions', 'skills/captions/SKILL.md'), id: step.skillId!, interpretationStatus: 'ready' as const };
  step.skillName = skill.name;
  const prompt = buildCodexPrompt(result.task, [skill]);
  assert.match(prompt, /Skill「Captions Automation」/);
  assert.match(prompt, /原始路径：skills\/captions\/SKILL\.md/);
  assert.ok(!prompt.includes('$Captions Automation'));
});
