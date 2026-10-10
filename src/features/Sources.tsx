import { useEffect, useRef, useState } from 'react';
import { ExternalLink, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { BridgeStatus, ScanJob, Source } from '../domain/types';
import { addSource, deleteSource, discoverSources, getAuthors, getJobs, getSources, hasBridgeToken, scanSource, updateSource } from '../services/bridge';
import { displayTime, EmptyState, errorMessage, Modal } from '../components/Modal';

const statusNames: Record<Source['status'], string> = { idle: '等待检查', scanning: '正在检查', complete: '已更新', partial: '部分完成', error: '检查失败' };
const jobStatusNames: Record<ScanJob['status'], string> = { queued: '等待中', running: '进行中', completed: '已完成', failed: '未完成', paused: '已暂停' };

export function Sources({ bridgeStatus, bridgeUrl, onSettings, onCatalogRefresh, notify }: { bridgeStatus: BridgeStatus; bridgeUrl: string; onSettings: () => void; onCatalogRefresh: () => Promise<void>; notify: (message: string, kind?: 'error' | 'success') => void }) {
  const [sources, setSources] = useState<Source[]>([]); const [authors, setAuthors] = useState<Source[]>([]); const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [busy, setBusy] = useState(''); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false); const [url, setUrl] = useState(''); const [kind, setKind] = useState<'repository' | 'author'>('repository');
  const refreshRunning = useRef(false); const refreshPending = useRef(false); const lastFinished = useRef('');
  const connected = hasBridgeToken();
  async function refresh(showLoading = false) {
    if (!connected) return;
    if (refreshRunning.current) { refreshPending.current = true; return; }
    refreshRunning.current = true;
    if (showLoading) setLoading(true);
    try {
      const results = await Promise.allSettled([getSources(bridgeUrl), getAuthors(bridgeUrl), getJobs(bridgeUrl)]);
      if (results[0].status === 'fulfilled') setSources(results[0].value);
      if (results[1].status === 'fulfilled') setAuthors(results[1].value);
      if (results[2].status === 'fulfilled') {
        setJobs(results[2].value);
        const finished = results[2].value.filter(job => job.status === 'completed').map(job => job.id).join(',');
        if (finished !== lastFinished.current) { await onCatalogRefresh(); lastFinished.current = finished; }
      }
      const failure = results.find(result => result.status === 'rejected');
      setError(failure?.status === 'rejected' ? errorMessage(failure.reason) : '');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { refreshRunning.current = false; setLoading(false); if (refreshPending.current) { refreshPending.current = false; void refresh(); } }
  }
  useEffect(() => { if (connected) void refresh(true); }, [connected, bridgeUrl]);
  const activeJobs = jobs.some(job => job.status === 'queued' || job.status === 'running');
  useEffect(() => {
    if (!connected) return;
    const timer = window.setInterval(() => void refresh(), activeJobs ? 3500 : 30000);
    return () => clearInterval(timer);
  }, [connected, bridgeUrl, activeJobs]);
  async function action(id: string, perform: () => Promise<unknown>, success: string) {
    if (busy) return; setBusy(id); setError('');
    try { await perform(); notify(success); await refresh(); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function add() {
    if (busy || !url.trim()) return;
    await action('add', async () => { await addSource(bridgeUrl, url.trim(), kind === 'author'); setAddOpen(false); setUrl(''); }, kind === 'author' ? '已关注这个作者，后台会检查新的公开能力。' : '已添加来源，后台会自动检查。');
  }
  const renderSource = (source: Source, author = false) => {
    const success = source.lastSuccessAt ? new Date(source.lastSuccessAt).getTime() : NaN;
    const unfinished = !Number.isFinite(success) || Date.now() - success > 24 * 60 * 60 * 1000 || source.status === 'partial';
    return <article className={`source-card ${!source.enabled ? 'source-disabled' : ''}`} key={source.id}><div className="source-info"><h3>{source.name || (author ? source.owner : `${source.owner}/${source.repo}`)}</h3><p>{author ? '关注作者的公开仓库' : `${source.skillCount} 项能力已收录`} · {source.enabled ? statusNames[source.status] : '已暂停'}</p><div className="source-meta"><small>上次尝试：{displayTime(source.lastCheckedAt)}</small><small>最后成功检查：{displayTime(source.lastSuccessAt)}</small>{unfinished ? <span className="badge badge-warning">检查尚未完成</span> : null}</div>{source.error ? <p className="error-message">{source.error}</p> : null}</div><div className="source-actions"><a className="icon-button" aria-label={`查看${source.name}的来源`} href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={17} /></a><button className="text-button" disabled={Boolean(busy)} onClick={() => void action(source.id, () => updateSource(bridgeUrl, source.id, !source.enabled, author), source.enabled ? '已暂停自动检查。' : '已恢复自动检查。')}>{source.enabled ? '暂停' : '恢复'}</button>{!author ? <button className="secondary-button" disabled={Boolean(busy) || source.status === 'scanning' || !source.enabled} onClick={() => void action(source.id, () => scanSource(bridgeUrl, source.id), '检查已经开始，完成后能力库会更新。')}><RefreshCw size={16} />检查</button> : null}<button className="icon-button" disabled={Boolean(busy)} aria-label={`删除来源${source.name}`} onClick={() => { if (window.confirm(`移除「${source.name}」${author ? '作者关注' : '来源'}吗？已经收录的能力会保留。`)) void action(source.id, () => deleteSource(bridgeUrl, source.id, author), '已移除来源。'); }}><Trash2 size={17} /></button></div></article>;
  };
  return <section><div className="page-header"><div><h1>能力来源</h1><p>让系统帮你找到新的能力，并持续检查更新。</p></div><button className="primary-button" disabled={!connected || Boolean(busy)} onClick={() => setAddOpen(true)}><Plus size={18} />添加来源</button></div>
    {!connected ? <EmptyState title="连接后，就可以自动发现能力" text="这项功能通过你电脑上的本机服务读取 GitHub。首页的本地推荐仍然可以使用。"><button className="primary-button" onClick={onSettings}>前往连接设置</button></EmptyState> : <>
      <div className="source-toolbar"><span className="muted">{bridgeStatus.backgroundEnabled ? '后台自动检查已开启' : '后台自动检查已暂停'}</span><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void action('discover', () => discoverSources(bridgeUrl), '已经开始发现热门仓库和关注作者的新能力。')}>{busy === 'discover' ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}发现更多能力</button></div>
      {error ? <div className="error-message" role="alert">{error}<button className="text-button" onClick={() => void refresh(true)} disabled={loading}>重试</button></div> : null}
      {loading ? <p className="muted"><LoaderCircle className="spin" size={17} />正在读取来源…</p> : null}
      <div className="subsection-heading"><h2>已添加的仓库</h2><span>{sources.length} 个</span></div>{sources.length ? <div className="source-list">{sources.map(source => renderSource(source))}</div> : !loading ? <EmptyState title="还没有添加仓库" text="粘贴一个 GitHub 仓库地址，系统会寻找里面的能力说明。" /> : null}
      <div className="subsection-heading"><h2>关注的作者</h2><button className="text-button" disabled={Boolean(busy)} onClick={() => { setKind('author'); setAddOpen(true); }}>关注作者<Plus size={15} /></button></div>{authors.length ? <div className="source-list">{authors.map(source => renderSource(source, true))}</div> : <p className="muted">关注作者后，系统会继续发现他们发布的新能力。</p>}
      {jobs.length ? <details className="scan-jobs" open={activeJobs}><summary>{activeJobs ? '正在检查来源' : '最近的检查记录'}</summary>{jobs.slice(0, 8).map(job => <div className="scan-job" key={job.id}><span className={`badge ${job.status === 'failed' ? 'badge-warning' : ''}`}>{jobStatusNames[job.status]}</span><div><p>{job.message || '检查能力来源'}</p><small>{job.total > 0 ? `${job.processed}/${job.total} · ` : ''}{displayTime(job.updatedAt)}</small></div></div>)}</details> : null}
    </>}
    {addOpen ? <Modal title="添加能力来源" onClose={() => setAddOpen(false)} busy={Boolean(busy)}><div className="tabs" role="tablist" aria-label="来源类型"><button role="tab" aria-selected={kind === 'repository'} className={kind === 'repository' ? 'active' : ''} disabled={Boolean(busy)} onClick={() => setKind('repository')}>仓库地址</button><button role="tab" aria-selected={kind === 'author'} className={kind === 'author' ? 'active' : ''} disabled={Boolean(busy)} onClick={() => setKind('author')}>作者主页</button></div><form onSubmit={event => { event.preventDefault(); void add(); }}><label className="form-field"><span>{kind === 'author' ? 'GitHub 作者主页' : 'GitHub 仓库地址'}</span><input type="url" required value={url} disabled={Boolean(busy)} onChange={event => setUrl(event.target.value)} placeholder={kind === 'author' ? 'https://github.com/作者名称' : 'https://github.com/作者名称/仓库名称'} /></label><p className="muted">添加后，系统会自动寻找能力说明并生成中文解释。</p>{error ? <p className="error-message" role="alert">{error}</p> : null}<div className="modal-actions"><button className="primary-button" type="submit" disabled={Boolean(busy) || !url.trim()}>{busy === 'add' ? <LoaderCircle className="spin" size={17} /> : null}添加并检查</button></div></form></Modal> : null}
  </section>;
}
