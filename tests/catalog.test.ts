import test from 'node:test';
import assert from 'node:assert/strict';
import { GithubSkillScanner, popularQueries } from '../server/GithubSkillScanner.ts';
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
