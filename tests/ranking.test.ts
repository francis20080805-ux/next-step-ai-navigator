import test from 'node:test';
import assert from 'node:assert/strict';
import type { Skill } from '../src/domain/types.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import { rankSkills } from '../src/core/SkillRanking.ts';

const now = new Date('2026-10-12T00:00:00.000Z');
function skill(overrides: Partial<Skill> = {}): Skill {
  return { ...seedSkills.find((item) => item.name === 'Spreadsheets')!, ...overrides };
}
function github(name: string, stars?: number, overrides: Partial<Skill> = {}): Skill {
  return skill({ id: `github:${name}`, name, sourceType: 'github', githubUrl: 'https://github.com/example/skills/blob/abc/SKILL.md', githubStars: stars, ...overrides });
}

test('only interpreted real skills participate; unavailable and removed records stay excluded', () => {
  const records = [skill(),
    skill({ id: 'pending', interpretationStatus: 'pending' }),
    skill({ id: 'failed', interpretationStatus: 'failed' }),
    skill({ id: 'connector', capabilityKind: 'connector' }),
    ...(['removed', 'deprecated', 'unavailable'] as const).map((maintenanceStatus) => skill({ id: maintenanceStatus, maintenanceStatus })),
  ];
  assert.deepEqual(rankSkills(records, { now }).map((row) => row.skill.id), [skill().id]);
});

test('a huge repository does not replace ordinary office skills at the top of recommendations', () => {
  const ordinary = skill();
  const specialized = github('kernel-exploit-research', 1_000_000, { taskTypes: ['other'] });
  const recommended = rankSkills([specialized, ordinary], { now });
  assert.equal(recommended[0].skill, ordinary);
  assert.match(recommended[0].reason, /表格/);
  assert.equal(recommended[0].stars, null);
  assert.deepEqual(rankSkills([specialized, ordinary], { mode: 'stars', now }).map((row) => row.skill.name), ['kernel-exploit-research']);
});

test('stars rank is strictly repository stars, not maintenance, curated status or number of skills', () => {
  const records = [github('Spreadsheets', 90), github('older-tool', 200, { maintenanceStatus: 'stale' }),
    github('another-tool', 90), github('new-tool', 100, { githubUrl: 'https://github.com/example/new-repo' })];
  const rows = rankSkills(records, { mode: 'stars', now });
  assert.deepEqual(rows.map((row) => row.stars), [200, 100, 90, 90]);
  assert.equal(rows[0].repo, 'example/skills');
  assert.equal(rows[2].repo, rows[3].repo);
  assert.equal(rows[2].stars, rows[3].stars);
});

test('unknown, invalid and unattributed star values are excluded, while a verified zero is valid', () => {
  const records = [github('missing'), github('nan', NaN), github('negative', -1), github('fraction', 2.5),
    github('unsafe', Number.MAX_SAFE_INTEGER + 1), github('wrong-host', 999, { githubUrl: 'https://github.com.evil.example/x/y' }),
    github('no-repo', 999, { githubUrl: 'https://github.com/' }),
    github('credentials', 999, { githubUrl: 'https://user:password@github.com/x/y' }),
    github('nonstandard-port', 999, { githubUrl: 'https://github.com:8443/x/y' }),
    github('http', 999, { githubUrl: 'http://github.com/x/y' }),
    github('self-import', 999_999, { sourceType: 'import' }),
    github('system-summary', 999_999, { sourceType: 'system' }), github('zero', 0)];
  assert.deepEqual(rankSkills(records, { mode: 'stars', now }).map((row) => [row.skill.name, row.stars]), [['zero', 0]]);
});

test('same English skill across repositories appears once; recommendation keeps local summary and stars uses the highest source', () => {
  const local = skill();
  const low = github('spreadsheets', 20, { id: 'repo-low' });
  const high = github(' Spreadsheets ', 200, { id: 'repo-high', githubUrl: 'https://github.com/example/popular' });
  assert.equal(rankSkills([high, low, local], { now })[0].skill, local);
  const hot = rankSkills([local, high, low], { mode: 'stars', now });
  assert.equal(hot.length, 1);
  assert.equal(hot[0].skill, high);
  assert.equal(hot[0].repo, 'example/popular');
  assert.equal(hot[0].stars, 200);
  const tied = [github('Spreadsheets', 20, { id: 'z' }), github('Spreadsheets', 20, { id: 'a' })];
  assert.equal(rankSkills(tied, { now })[0].skill.id, 'a');
  assert.deepEqual(rankSkills(tied, { mode: 'stars', now }), rankSkills([...tied].reverse(), { mode: 'stars', now }));
});

test('active duplicate is preferred over a stale local summary and stale skills rank lower', () => {
  const stale = skill({ maintenanceStatus: 'stale' });
  const active = github('Spreadsheets', 20);
  assert.equal(rankSkills([stale, active], { now })[0].skill, active);
  const older = github('old-niche', 50, { maintenanceStatus: 'stale', updatedAt: '2024-01-01T00:00:00.000Z' });
  const newer = github('new-niche', 50);
  assert.equal(rankSkills([older, newer], { now })[0].skill, newer);
});

test('spoken search, English names, task categories and labels reuse the catalog search', () => {
  const rows = rankSkills(seedSkills, { query: '库存', category: 'spreadsheet', now, limit: seedSkills.length });
  assert.ok(rows.some((row) => row.skill.name === 'Spreadsheets'));
  assert.ok(rows.every((row) => row.skill.taskTypes.includes('spreadsheet')));
  const video = rankSkills(seedSkills, { query: 'captions', category: 'video', now });
  assert.deepEqual(video.map((row) => row.skill.name), ['remotion-captions']);
  assert.deepEqual(rankSkills(seedSkills, { query: 'captions', category: 'spreadsheet', now }), []);
  assert.equal(rankSkills(seedSkills, { category: 'all', now, limit: seedSkills.length }).length, 45);
});

test('rank, limits and tied ordering are stable regardless of catalog input order without mutating records', () => {
  const records = Array.from({ length: 25 }, (_, i) => github(`tool-${String(i).padStart(2, '0')}`, 50));
  const copy = structuredClone(records);
  const normal = rankSkills(records, { now, limit: records.length });
  const reversed = rankSkills([...records].reverse(), { now, limit: 30 });
  assert.deepEqual(normal, reversed);
  assert.deepEqual(normal.map((row) => row.rank), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.equal(rankSkills(records, { now }).length, 20);
  assert.equal(rankSkills(records, { now, limit: 2.9 }).length, 2);
  assert.deepEqual(rankSkills(records, { now, limit: -1 }), []);
  assert.deepEqual(rankSkills([], { now }), []);
  assert.deepEqual(records, copy);
});
