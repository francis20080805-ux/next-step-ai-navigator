import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
const url='http://127.0.0.1:8787';
const child=spawn(process.execPath,['--env-file-if-exists=.env','--experimental-strip-types','server/index.ts','--serve'],{stdio:'inherit',windowsHide:true});
let stopped=false;
child.on('error',error=>{stopped=true;console.error('本机服务没有启动：',error.message);process.exitCode=1;});
child.on('exit',code=>{stopped=true;process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
for(let attempt=0;attempt<40&&!stopped;attempt++){
  try{const result=await fetch(url,{signal:AbortSignal.timeout(700)});if(result.ok){if(process.platform==='win32')spawn('explorer.exe',[url],{stdio:'ignore',windowsHide:true});else console.log('打开浏览器：'+url);break;}}catch{}
  await setTimeout(250);
}
