import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath, basename, sep } from 'node:path';
import type { BridgeStatus } from '../src/domain/types.ts';

const disabledFeatures = ['shell_tool', 'unified_exec', 'apps', 'browser_use', 'browser_use_external', 'in_app_browser', 'computer_use', 'hooks', 'plugins', 'image_generation', 'multi_agent', 'skill_search', 'remote_plugin', 'memories', 'code_mode_host'];
export function codexArgs(schemaPath: string, directory: string): string[] {
  return ['exec', '--json', '--ephemeral', '--sandbox', 'read-only', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--output-schema', schemaPath, '--cd', directory, '--enable', 'respect_system_proxy', '-c', 'web_search="disabled"', '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"', '-c', 'shell_environment_policy.inherit="none"', ...disabledFeatures.flatMap(feature => ['--disable', feature]), '-'];
}
function safeEnvironment(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/API_KEY|ACCESS_TOKEN|GITHUB_TOKEN|GH_TOKEN|AZURE_OPENAI|OPENAI_BASE_URL|CODEX_API_KEY/i.test(key)) delete env[key];
  return env;
}
export function parseCodexEvents(output: string): unknown {
  let answer = '', completed = false;
  for (const line of output.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event.item?.type === 'agent_message' && typeof event.item.text === 'string') answer = event.item.text;
      if (event.type === 'turn.completed') completed = true;
      if (event.type === 'error' || event.type === 'turn.failed') throw new Error(event.message || event.error?.message || 'Codex 暂时不可用');
    } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
  }
  if (!answer || !completed) throw new Error('Codex 尚未确认本次理解已完成');
  return JSON.parse(answer.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
export class CodexBridge {
  binary: string;
  pausedUntil = 0;
  lastMessage = '';
  backgroundDay = '';
  interpretedToday = 0;
  onUsageChange?: () => Promise<void>;
  private foreground: (() => Promise<void>)[] = [];
  private background: (() => Promise<void>)[] = [];
  private running = false;
  constructor(binary = process.env.CODEX_BINARY || (process.platform === 'win32' ? 'codex.exe' : 'codex')) { this.binary = binary; }
  async status(): Promise<Pick<BridgeStatus, 'codexAvailable' | 'authMode' | 'message'>> {
    try {
      const result = await this.run(['login', 'status'], undefined, 6000);
      const output = result.trim();
      if (/ChatGPT/i.test(output)) return { codexAvailable: true, authMode: 'chatgpt', message: this.lastMessage || '已连接本机 Codex，使用现有 ChatGPT 额度' };
      return { codexAvailable: true, authMode: /API key|api_key/i.test(output) ? 'api-key' : 'none', message: '请在 Codex 中使用 ChatGPT 账号登录；不会使用 API 付费' };
    } catch { return { codexAvailable: false, authMode: 'none', message: '暂未找到已登录的 Codex，可以继续使用本地推荐' }; }
  }
  async interpret(prompt: string, schema: unknown, priority: 'foreground' | 'background' = 'foreground'): Promise<unknown> {
    const status = await this.status();
    if (status.authMode !== 'chatgpt') throw new Error(status.message);
    if (Date.now() < this.pausedUntil) throw new Error(this.lastMessage || '现有额度暂不可用，稍后再试');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (today !== this.backgroundDay) { this.backgroundDay = today; this.interpretedToday = 0; await this.onUsageChange?.(); }
    if (priority === 'background' && this.interpretedToday >= 20) throw new Error('今日后台解释已达 20 项，明天继续');
    return new Promise((resolve, reject) => {
      const job = async () => {
        const directory = await mkdtemp(join(tmpdir(), 'next-step-codex-'));
        try {
          if (priority === 'background' && this.interpretedToday >= 20) throw new Error('今日后台解释已达 20 项，明天继续');
          if (Date.now() < this.pausedUntil) throw new Error(this.lastMessage || '现有额度暂不可用，稍后再试');
          if (priority === 'background') { this.interpretedToday++; await this.onUsageChange?.(); }
          const schemaPath = join(directory, 'response-schema.json');
          await writeFile(schemaPath, JSON.stringify(schema));
          const output = await this.run(codexArgs(schemaPath, directory), prompt, 120000);
          const parsed = parseCodexEvents(output);
          this.lastMessage = '';
          await this.onUsageChange?.();
          resolve(parsed);
        } catch (error) {
          const message = error instanceof Error ? error.message : '现有额度暂不可用';
          if (/rate.?limit|quota|usage limit|额度|限额|insufficient|429/i.test(message)) { this.pausedUntil = Date.now() + 3600000; this.lastMessage = 'ChatGPT 现有额度暂不可用，后台已暂停；继续提供本地推荐'; }
          await this.onUsageChange?.();
          reject(new Error(this.lastMessage || message.slice(0, 240)));
        } finally {
          const target = resolvePath(directory), temporaryRoot = resolvePath(tmpdir());
          if (target.startsWith(temporaryRoot + sep) && basename(target).startsWith('next-step-codex-')) await rm(target, { recursive: true, force: true });
        }
      };
      (priority === 'foreground' ? this.foreground : this.background).push(job);
      void this.drain();
    });
  }
  private async drain() {
    if (this.running) return;
    this.running = true;
    try { while (this.foreground.length || this.background.length) await (this.foreground.shift() || this.background.shift())!(); }
    finally { this.running = false; }
  }
  private run(args: string[], input: string | undefined, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binary, args, { shell: false, windowsHide: true, env: safeEnvironment(), stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', errors = '';
      const timer = setTimeout(() => { child.kill(); reject(new Error('Codex 理解超时，继续使用本地推荐')); }, timeout);
      child.stdout.on('data', chunk => { output += chunk; if (output.length > 2000000) child.kill(); });
      child.stderr.on('data', chunk => { errors += chunk; if (errors.length > 2000000) child.kill(); });
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output + (args[0] === 'login' ? errors : '')) : reject(new Error(errors.slice(-600) || output.slice(-600) || 'Codex 暂时不可用')); });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  }
}
