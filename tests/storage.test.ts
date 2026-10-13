import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultData, validateBackup } from '../src/services/StorageLayer.ts';
import { seedSkills } from '../src/data/seedSkills.ts';
import { interpretLocal } from '../src/core/TaskInterpreter.ts';
import { mergeSkills } from '../src/services/SkillRepository.ts';
test('backup validates real task and catalog without losing progress',()=>{
  const result=interpretLocal('我有产品图片，要30秒竖屏宣传视频，带字幕');
  assert.equal(result.kind,'task');if(result.kind!=='task') return;
  const data={...defaultData(),tasks:[result.task],skills:seedSkills};
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(data))),data);
});
test('incomplete task or skill backup is rejected before replacement',()=>{
  assert.throws(()=>validateBackup({...defaultData(),skills:[{id:'broken',name:'bad',chineseName:'错误'}]}),/能力数据不完整/);
  const result=interpretLocal('视频做好了，只加字幕');if(result.kind!=='task')throw Error('expected task');
  assert.throws(()=>validateBackup({...defaultData(),tasks:[{...result.task,steps:[{id:'broken'}]}]}),/任务数据不完整/);
  assert.throws(()=>validateBackup({...defaultData(),settings:{...defaultData().settings,bridgeUrl:'https://external.example'}}),/本机连接地址/);
  assert.throws(()=>validateBackup({...defaultData(),favoriteSkillIds:[123]}),/备份格式/);
});
test('same content public cache preserves local interpretation; changed content waits again',()=>{
  const ready={...seedSkills[0],contentHash:'sha256:a'};
  const pending={...ready,interpretationStatus:'pending' as const,chineseName:'待解释'};
  assert.equal(mergeSkills([ready],[pending])[0].chineseName,ready.chineseName);
  assert.equal(mergeSkills([ready],[{...pending,maintenanceStatus:'removed'}])[0].maintenanceStatus,'removed');
  assert.equal(mergeSkills([ready],[{...pending,contentHash:'sha256:b'}])[0].interpretationStatus,'pending');
});
test('an older built-in cache cannot undo a corrected capability, while personal imports remain intact',()=>{
  const current=seedSkills.find(skill=>skill.name==='remotion-multimedia')!;
  const older={...current,version:'catalog-1',chineseName:'旧版错误的素材编排说明'};
  assert.equal(mergeSkills([current],[older])[0].chineseName,current.chineseName);
  assert.equal(mergeSkills([older],[current])[0].version,'catalog-2');
  const personal={...older,sourceType:'import' as const,chineseName:'我自己的说明'};
  assert.equal(mergeSkills([current],[personal])[0].chineseName,personal.chineseName);
});
