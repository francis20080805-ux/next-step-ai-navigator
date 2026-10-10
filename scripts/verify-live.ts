import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep, basename } from 'node:path';
import { createBridgeServer } from '../server/index.ts';
const directory=await mkdtemp(join(tmpdir(),'next-step-live-'));
const bridge=await createBridgeServer({statePath:join(directory,'state.json'),pairCode:'124578'});
await new Promise<void>(ok=>bridge.server.listen(0,'127.0.0.1',ok));
const address=bridge.server.address() as {port:number};
const base=`http://127.0.0.1:${address.port}`;const origin='http://127.0.0.1:5173';
let token='';
const call=async(path:string,body?:unknown)=>{const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(130000)});const data=await response.json();assert.ok(response.ok,data.error);return data;};
try{
  token=(await call('/api/pair',{code:'124578'})).token;
  const result=await call('/api/tasks/interpret',{input:'我有产品图片，要一个30秒1080x1920竖屏宣传视频，带字幕，不要背景音乐。'});
  assert.equal(result.kind,'task');assert.equal(result.task.mode,'codex',result.notice);
  assert.ok(result.task.steps.some((s:{skillName:string})=>s.skillName==='remotion-create'));
  assert.ok(result.task.steps.some((s:{skillName:string})=>s.skillName==='remotion-captions'));
  assert.ok(result.task.steps.some((s:{skillName:string})=>s.skillName==='remotion-render'));
  const followup=await call('/api/tasks/interpret',{input:'视频已经做好了，只加字幕，最后导出。',previous:result.task});
  assert.equal(followup.kind,'task');assert.equal(followup.task.mode,'codex',followup.notice);
  assert.equal(followup.task.id,result.task.id);
  assert.ok(followup.task.steps.some((s:{action:string;status:string})=>s.action==='video.create'&&s.status==='completed'));
  assert.deepEqual(followup.task.steps.filter((s:{status:string})=>s.status==='pending').map((s:{skillName:string})=>s.skillName),['remotion-captions','remotion-render']);
  const record={verifiedAt:new Date().toISOString(),mode:'codex',chatgptOnly:true,checks:['真实API配对','完整视频参数与真实能力匹配','补充已完成视频保持任务ID并推进字幕和导出'],parameters:result.task.intent.parameters};
  await writeFile('.data/live-verification.json',JSON.stringify(record,null,2));console.log(JSON.stringify(record));
}finally{
  await new Promise<void>(ok=>bridge.server.close(()=>ok()));
  const target=resolve(directory);const root=resolve(tmpdir());if(!target.startsWith(root+sep)||!basename(target).startsWith('next-step-live-'))throw Error('Unsafe temporary cleanup');
  await rm(target,{recursive:true,force:true});
}
