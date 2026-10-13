import { useRef, useState } from 'react';
import { ArrowRight, BarChart3, Check, CheckCircle2, Copy, FileText, Globe, LoaderCircle, Play, Presentation, Scissors, Sheet, Star } from 'lucide-react';
import type { BridgeStatus, Clarification, Skill, TaskRecord, WorkflowStep } from '../domain/types';
import { interpretLocal } from '../core/TaskInterpreter';
import { buildCodexPrompt, completeStep } from '../core/WorkflowPlanner';
import { hasBridgeToken, interpretTask } from '../services/bridge';
import { errorMessage, Modal } from '../components/Modal';

const quickTasks = [{ title: '剪视频', input: '我要剪一个短视频', icon: Scissors }, { title: '做表格', input: '我要做表格', icon: Sheet }, { title: '做 PPT', input: '我要做 PPT', icon: Presentation }, { title: '做网页', input: '我要做网页', icon: Globe }, { title: '处理 PDF', input: '我要处理 PDF', icon: FileText }, { title: '数据分析', input: '我要分析数据', icon: BarChart3 }];

export function TaskWorkspace({ task, skills, bridgeStatus, bridgeUrl, preferAI, onTask, onNew, onDetail, notify }: { task?: TaskRecord; skills: Skill[]; bridgeStatus: BridgeStatus; bridgeUrl: string; preferAI: boolean; onTask: (task: TaskRecord) => Promise<void>; onNew: () => void; onDetail: (id: string) => void; notify: (message: string, kind?: 'error' | 'success') => void }) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clarification, setClarification] = useState<Clarification | null>(null);
  const [notice, setNotice] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [expandNext, setExpandNext] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const workflow = useRef<HTMLElement>(null);
  async function submit(value = input) {
    if (!value.trim() || busy) return;
    setBusy(true); setNotice('');
    const submitted = clarification ? `${clarification.originalInput}。${value}` : value;
    try {
      let fallbackNotice = '';
      let result;
      if (preferAI && bridgeStatus.connected && bridgeStatus.authMode === 'chatgpt' && hasBridgeToken()) {
        try { result = await interpretTask(bridgeUrl, submitted, task, skills); }
        catch (error) {
          const reason = errorMessage(error);
          result = interpretLocal(submitted, task, skills);
          fallbackNotice = `${reason} 已改用本地常见任务规则，原始输入已保留。`;
        }
      } else result = interpretLocal(submitted, task, skills);
      if (result.kind === 'clarification') { setClarification(result.clarification); setInput(''); if (fallbackNotice) setNotice(fallbackNotice); }
      else {
        setSaving(true); await onTask(result.task); setClarification(null); if (!fallbackNotice) setInput('');
        if (fallbackNotice || result.notice) setNotice([fallbackNotice, result.notice].filter(Boolean).join(' '));
        if (task && !fallbackNotice) requestAnimationFrame(() => workflow.current?.scrollIntoView({ block: 'start', behavior: 'instant' }));
      }
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); setSaving(false); }
  }
  async function changeTask(next: TaskRecord, afterSave?: () => void) { if (busy) return; setBusy(true); setSaving(true); try { await onTask(next); afterSave?.(); } catch (failure) { notify(errorMessage(failure), 'error'); } finally { setBusy(false); setSaving(false); } }
  async function copyPrompt() {
    if (!task || copying) return; setCopying(true);
    try { await navigator.clipboard.writeText(buildCodexPrompt(task, skills)); notify('已复制执行提示词和要调用的能力，粘贴到 Codex 就可以继续。'); }
    catch { setPromptOpen(true); notify('浏览器未允许自动复制，请在打开的文本中全选复制。', 'error'); }
    finally { setCopying(false); }
  }
  const pending = task?.steps.filter(step => step.status === 'pending') ?? [];
  const completed = task?.steps.filter(step => step.status === 'completed') ?? [];
  const current = pending[0];
  const last = pending.length > 1 ? pending.at(-1) : undefined;
  const next = pending.slice(1, last ? -1 : undefined);
  function renderStep(step: WorkflowStep, currentStep = false) {
    const number = (task?.steps.findIndex(item => item.id === step.id) ?? 0) + 1;
    return <article key={step.id} className={`step-card workflow-step ${currentStep ? 'step-current' : ''} ${step.status === 'completed' ? 'step-completed' : ''}`}>
      <span className="step-number">{step.status === 'completed' ? <Check size={20} /> : String(number).padStart(2, '0')}</span>
      <div className="step-copy"><h3>{step.title}{step.optional ? <span className="badge">可选</span> : null}</h3><p>{step.description}</p>{step.skillId ? <button className="skill-english text-button" onClick={() => onDetail(step.skillId!)}>{step.skillName}</button> : <span className="skill-english">手动准备这一步</span>}</div>
      {currentStep ? <button className="secondary-button complete-step" disabled={busy} onClick={() => { try { if (task) void changeTask(completeStep(task, step.id)); } catch (failure) { notify(errorMessage(failure), 'error'); } }}><CheckCircle2 size={17} />这步做好了</button> : null}
      {step.optional && step.status === 'pending' ? <button className="text-button skip-step" disabled={busy} onClick={() => {
        if (!task) return; const steps = task.steps.map(item => item.id === step.id ? { ...item, status: 'skipped' as const } : item);
        void changeTask({ ...task, steps, updatedAt: new Date().toISOString(), status: steps.every(item => item.status !== 'pending') ? 'completed' : task.status });
      }}>跳过</button> : null}
    </article>;
  }
  const composer = <form className={`composer ${busy ? 'is-busy' : ''}`} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <textarea ref={textarea} aria-label={task ? '补充当前进度' : '你今天想让 AI 帮你做什么？'} placeholder={task ? '补充当前进度，例如：视频已经做好了，现在还没字幕。' : '例如：我有产品图片，想做一个带字幕的短视频。'} value={input} disabled={busy} onChange={event => setInput(event.target.value)} maxLength={8000} />
      <div className="composer-bottom"><span className="composer-hint">{saving ? '正在保存进度…' : busy ? '正在整理步骤…' : task ? '告诉我已经做到哪里，我会更新剩余步骤。' : '用自己的话说就好。'}</span><button className="primary-button" type="submit" disabled={busy || !input.trim()}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{saving ? '正在保存' : busy ? '正在整理' : task ? '更新下一步' : '帮我安排下一步'}{!busy ? <ArrowRight size={18} /> : null}</button></div>
    </form>;
  return <section className={`task-workspace ${task ? 'has-task' : ''}`}>
    <div className="home-heading"><h1>{task ? '继续完成你的任务' : '你今天想让 AI 帮你做什么？'}</h1>{task ? <button className="text-button" disabled={busy} onClick={onNew}>开始新任务<ArrowRight size={16} /></button> : null}</div>
    {!task ? composer : null}
    {!task && !clarification ? <div className="quick-tasks">{quickTasks.map(({ title, input: suggestion, icon: Icon }) => <button key={title} disabled={busy} onClick={() => { setInput(suggestion); textarea.current?.focus(); }}><Icon size={20} />{title}</button>)}</div> : null}
    {notice ? <div className="notice" role="status">{notice}</div> : null}
    {clarification ? <section className="clarification" aria-live="polite"><h2>{clarification.question}</h2><div className="choice-list">{clarification.options.map(option => <button className="secondary-button" key={option} disabled={busy} onClick={() => option === '其他' ? textarea.current?.focus() : void submit(option)}>{option}</button>)}</div><p className="muted">也可以在上面补充一句。</p></section> : null}
    {task ? <section className="workflow task-result" aria-label="推荐任务步骤" ref={workflow}>
      <div className="workflow-heading result-heading"><div><h2>{task.title}</h2><span className="mode-label">{task.mode === 'codex' ? 'AI 为你安排' : '本地常见任务规则'}</span></div><button className={`icon-button ${task.favorite ? 'favorited' : ''}`} aria-label={task.favorite ? '取消收藏任务' : '收藏任务'} aria-pressed={task.favorite} disabled={busy} onClick={() => void changeTask({ ...task, favorite: !task.favorite })}><Star size={20} fill={task.favorite ? 'currentColor' : 'none'} /></button></div>
      {completed.length ? <details className="completed-steps"><summary>已完成 {completed.length} 步</summary>{completed.map(step => renderStep(step))}</details> : null}
      {current ? <div className="workflow-section"><h3 className="section-label section-label-current current-label">现在用</h3>{renderStep(current, true)}</div> : <div className="task-done success-state"><CheckCircle2 size={24} /><div><h3>这个任务的步骤都完成了</h3><p>有新的修改需求，直接在上面补充。</p></div></div>}
      {next.length ? <div className="workflow-section"><h3 className="section-label">下一步</h3>{(expandNext ? next : next.slice(0, 3)).map(step => renderStep(step))}{next.length > 3 ? <button className="text-button" onClick={() => setExpandNext(!expandNext)}>{expandNext ? '收起步骤' : `还有 ${next.length - 3} 步`}</button> : null}</div> : null}
      {last ? <div className="workflow-section"><h3 className="section-label">最后</h3>{renderStep(last)}</div> : null}
      <div className="workflow-actions"><button className="primary-button" disabled={copying || busy} onClick={() => void copyPrompt()}><Copy size={18} />复制给 Codex</button><button className="secondary-button" disabled={busy || task.status === 'completed'} onClick={() => { void changeTask({ ...task, status: 'started', updatedAt: new Date().toISOString() }, () => setStartOpen(true)); }}><Play size={18} />{task.status === 'started' ? '继续这个任务' : '开始这个任务'}</button></div>
      <details className="original-request task-context"><summary>查看原始需求与补充记录</summary>{task.inputs.map((text, index) => <p key={index}>{index + 1}. {text}</p>)}</details>
    </section> : <p className="home-footnote">{bridgeStatus.connected && preferAI ? '已连接你电脑上的 Codex。' : '现在可以用本地规则安排常见任务。连接你的 Codex 后，可以理解更复杂的需求。'}</p>}
    {task ? <section className="progress-composer"><h2 className="progress-heading">补充当前进度</h2>{composer}</section> : null}
    {task && (startOpen || promptOpen) ? <Modal title={startOpen ? '任务已经准备好' : '复制执行提示词'} onClose={() => { setStartOpen(false); setPromptOpen(false); }} wide><p>下面已包含当前步骤的执行要求、应调用的插件或 Skill 和剩余流程。复制到 Codex 的聊天框即可继续，这里会为你保存进度。</p><textarea className="prompt-text codex-prompt" aria-label="给 Codex 的任务文本" value={buildCodexPrompt(task, skills)} readOnly onFocus={event => event.target.select()} /><div className="modal-actions"><button className="primary-button" disabled={copying} onClick={() => void copyPrompt()}><Copy size={17} />复制执行提示词</button><button className="secondary-button" onClick={() => { setStartOpen(false); setPromptOpen(false); }}>回到步骤</button></div></Modal> : null}
  </section>;
}
