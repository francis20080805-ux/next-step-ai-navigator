import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Clock3, Grid2X2, Home, Link, LoaderCircle, Menu, Settings2, Star, Trophy, X } from 'lucide-react';
import type { AppData, BridgeStatus, Skill, TaskRecord } from './domain/types';
import { seedSkills } from './data/seedSkills';
import { defaultData, loadAppData, saveAppData, validateBackup } from './services/StorageLayer';
import { getBridgeStatus, getCatalog, hasBridgeToken, offlineStatus } from './services/bridge';
import { mergeSkills } from './services/SkillRepository';
import { Modal, errorMessage } from './components/Modal';
import { SkillDetail } from './components/SkillCard';
import { TaskWorkspace } from './features/TaskWorkspace';
import { History, Favorites } from './features/HistoryFavorites';
import { ImportSkillModal, Library } from './features/Library';
import { Sources } from './features/Sources';
import { Settings } from './features/Settings';
import { Ranking } from './features/Ranking';
import { updateSavedTaskCapabilities } from './core/WorkflowPlanner';

type Page = 'home' | 'history' | 'library' | 'ranking' | 'sources' | 'favorites' | 'settings';
const pages = [{ id: 'home' as const, label: '首页', icon: Home }, { id: 'history' as const, label: '任务历史', icon: Clock3 }, { id: 'library' as const, label: '能力库', icon: Grid2X2 }, { id: 'ranking' as const, label: '推荐榜', icon: Trophy }, { id: 'sources' as const, label: '能力来源', icon: Link }, { id: 'favorites' as const, label: '收藏', icon: Star }, { id: 'settings' as const, label: '设置', icon: Settings2 }];
const pageFromHash = (): Page => pages.find(page => page.id === location.hash.replace(/^#\/?/, ''))?.id ?? 'home';
const normalizeStatus = (status: BridgeStatus): BridgeStatus => ({ ...status, connected: status.connected && status.authMode === 'chatgpt' && hasBridgeToken() });

export default function App() {
  const [data, setData] = useState<AppData>(() => ({ ...defaultData(), skills: seedSkills }));
  const [loaded, setLoaded] = useState(false); const [storageError, setStorageError] = useState(''); const [canAutoSave, setCanAutoSave] = useState(false);
  const [page, setPage] = useState<Page>(pageFromHash); const [mobileMore, setMobileMore] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>(offlineStatus);
  const [activeTaskId, setActiveTaskId] = useState<string>(); const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [detailId, setDetailId] = useState<string>(); const [importOpen, setImportOpen] = useState(false); const [editSkill, setEditSkill] = useState<Skill>();
  const [toast, setToast] = useState<{ message: string; kind: 'error' | 'success' }>(); const toastTimer = useRef<number | undefined>(undefined);
  const saveQueue = useRef(Promise.resolve());
  const taskSaves = useRef<{ task: TaskRecord; resolve: () => void; reject: (error: unknown) => void }[]>([]);
  function settleTaskSaves(saved: AppData, failure?: unknown) { taskSaves.current = taskSaves.current.filter(waiter => { if (!saved.tasks.includes(waiter.task)) return true; if (failure) waiter.reject(failure); else waiter.resolve(); return false; }); }
  const notify = useCallback((message: string, kind: 'error' | 'success' = 'success') => {
    setToast({ message, kind }); window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(undefined), 6000);
  }, []);
  useEffect(() => {
    let cancelled = false;
    void loadAppData().then(next => { if (!cancelled) { const skills = mergeSkills(seedSkills, next.skills); setData({ ...next, skills, tasks: next.tasks.map(task => updateSavedTaskCapabilities(task, skills)) }); setCanAutoSave(true); } }).catch(failure => { if (!cancelled) setStorageError(`无法读取这台设备的保存数据：${errorMessage(failure)} 当前操作暂时只保存在内存中，请先导出备份。`); }).finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!loaded || !canAutoSave) return;
    saveQueue.current = saveQueue.current.then(() => saveAppData(data)).then(() => { setStorageError(''); settleTaskSaves(data); }).catch(failure => { setStorageError(`数据尚未保存：${errorMessage(failure)} 请保持页面打开并重试。`); settleTaskSaves(data, failure); });
  }, [data, loaded, canAutoSave]);
  useEffect(() => { const onHash = () => setPage(pageFromHash()); window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []);
  useEffect(() => {
    if (!loaded) return; let cancelled = false;
    async function status() {
      try { const next = normalizeStatus(await getBridgeStatus(data.settings.bridgeUrl)); if (!cancelled) setBridgeStatus(next); }
      catch { if (!cancelled) setBridgeStatus(offlineStatus); }
    }
    void status(); const timer = setInterval(() => void status(), 20000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [loaded, data.settings.bridgeUrl]);
  const refreshCatalog = useCallback(async () => {
    if (!hasBridgeToken()) return;
    const catalog = await getCatalog(data.settings.bridgeUrl);
    const valid = validateBackup({ ...defaultData(), skills: catalog });
    setData(current => ({ ...current, skills: mergeSkills(current.skills, valid.skills) }));
  }, [data.settings.bridgeUrl]);
  const bridgePaired = hasBridgeToken();
  useEffect(() => {
    if (!bridgePaired || !loaded) return;
    void refreshCatalog().catch(failure => notify(errorMessage(failure), 'error'));
    const timer = setInterval(() => void refreshCatalog().catch(() => {}), 60000);
    return () => clearInterval(timer);
  }, [bridgePaired, loaded, refreshCatalog, notify]);
  const refreshPublic = useCallback(async (value: string) => {
    const url = new URL(value, location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请填写有效的公共能力库网页地址。');
    const response = await fetch(url.href, { signal: AbortSignal.timeout(60000), ...(url.hostname === 'api.github.com' ? { headers: { Accept: 'application/vnd.github.raw+json' } } : {}) });
    if (!response.ok) throw new Error(`公共能力库暂时无法读取（${response.status}）。`);
    const rawText = await response.text();
    if (new TextEncoder().encode(rawText).byteLength > 25 * 1024 * 1024) throw new Error('公共能力库超过 25 MB，无法导入。');
    const raw = JSON.parse(rawText) as unknown;
    const skills = Array.isArray(raw) ? raw : (raw as { skills?: unknown })?.skills;
    const validated = validateBackup({ ...defaultData(), skills });
    setData(current => ({ ...current, skills: mergeSkills(current.skills, validated.skills) }));
  }, []);
  const loadedPublicUrl = useRef('');
  useEffect(() => {
    const url = data.settings.publicCatalogUrl;
    if (!loaded || !url || loadedPublicUrl.current === url) return;
    loadedPublicUrl.current = url; void refreshPublic(url).catch(failure => notify(errorMessage(failure), 'error'));
  }, [loaded, data.settings.publicCatalogUrl, refreshPublic, notify]);
  function navigate(next: Page) { setPage(next); location.hash = `/${next}`; setMobileMore(false); window.scrollTo({ top: 0 }); }
  function updateTask(task: TaskRecord): Promise<void> { const saved = canAutoSave ? new Promise<void>((resolve, reject) => taskSaves.current.push({ task, resolve, reject })) : Promise.reject(new Error('当前保存数据无法读取，任务保留在内存中，请先导出备份。')); setData(current => ({ ...current, tasks: [task, ...current.tasks.filter(item => item.id !== task.id)].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) })); setActiveTaskId(task.id); return saved; }
  function openTask(task: TaskRecord) { setActiveTaskId(task.id); setWorkspaceVersion(value => value + 1); navigate('home'); }
  function toggleSkillFavorite(id: string) { setData(current => ({ ...current, favoriteSkillIds: current.favoriteSkillIds.includes(id) ? current.favoriteSkillIds.filter(item => item !== id) : [...current.favoriteSkillIds, id] })); }
  function toggleTaskFavorite(task: TaskRecord) { setData(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, favorite: !item.favorite } : item) })); }
  async function restore(next: AppData) { await saveQueue.current; const skills = mergeSkills(seedSkills, next.skills), restored = { ...next, skills, tasks: next.tasks.map(task => updateSavedTaskCapabilities(task, skills)) }; await saveAppData(restored); setData(restored); setActiveTaskId(undefined); setWorkspaceVersion(value => value + 1); setStorageError(''); setCanAutoSave(true); }
  const task = data.tasks.find(item => item.id === activeTaskId); const detailSkill = data.skills.find(item => item.id === detailId);
  const currentPage = pages.find(item => item.id === page)!;
  return <div className="app-shell"><aside className="sidebar"><a className="brand" href="#/home" onClick={() => navigate('home')}><ArrowRight size={32} strokeWidth={3} /><span>下一步</span></a><nav aria-label="主导航">{pages.map(({ id, label, icon: Icon }) => <a key={id} className={`nav-item ${page === id ? 'active' : ''}`} href={`#/${id}`} aria-current={page === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={22} /><span>{label}</span></a>)}</nav><div className="sidebar-note"><span className={`connection-dot ${bridgeStatus.connected ? 'connected' : ''}`} />{bridgeStatus.connected ? '已连接你的 Codex' : '数据保存在这台设备'}</div></aside>
    <div className="mobile-header"><a className="brand" href="#/home" onClick={() => navigate('home')}><ArrowRight size={26} strokeWidth={3} /><span>下一步</span></a><span className="mobile-page-label">{currentPage.label}</span></div>
    <main className="main-content"><div className="content-inner"><div className="desktop-breadcrumb">{currentPage.label}</div>{storageError ? <div className="storage-error error-message" role="alert"><p>{storageError}</p><button className="secondary-button" onClick={async () => { try { if (!canAutoSave && !window.confirm('当前保存数据无法读取。继续会用当前页面的数据替换保存内容，请先在设置中导出备份。继续吗？')) return; await saveQueue.current; await saveAppData(data); setStorageError(''); setCanAutoSave(true); notify('数据已保存。'); } catch (failure) { setStorageError(errorMessage(failure)); } }}>重新保存</button></div> : null}
      {!loaded ? <div className="loading-state"><LoaderCircle className="spin" size={24} />正在打开你的任务…</div> : page === 'home' ? <TaskWorkspace key={workspaceVersion} task={task} skills={data.skills} bridgeStatus={bridgeStatus} bridgeUrl={data.settings.bridgeUrl} preferAI={data.settings.preferAI} onTask={updateTask} onNew={() => { setActiveTaskId(undefined); setWorkspaceVersion(value => value + 1); }} onDetail={setDetailId} notify={notify} /> : page === 'history' ? <History tasks={data.tasks} onOpen={openTask} onFavorite={toggleTaskFavorite} onDelete={id => setData(current => ({ ...current, tasks: current.tasks.filter(item => item.id !== id) }))} /> : page === 'library' ? <Library skills={data.skills} favorites={data.favoriteSkillIds} onFavorite={toggleSkillFavorite} onDetail={setDetailId} onImport={() => setImportOpen(true)} /> : page === 'ranking' ? <Ranking skills={data.skills} favorites={data.favoriteSkillIds} onFavorite={toggleSkillFavorite} onDetail={setDetailId} /> : page === 'sources' ? <Sources bridgeStatus={bridgeStatus} bridgeUrl={data.settings.bridgeUrl} onSettings={() => navigate('settings')} onCatalogRefresh={refreshCatalog} notify={notify} /> : page === 'favorites' ? <Favorites tasks={data.tasks} skills={data.skills} favoriteSkillIds={data.favoriteSkillIds} onOpen={openTask} onTaskFavorite={toggleTaskFavorite} onSkillFavorite={toggleSkillFavorite} onDetail={setDetailId} /> : <Settings data={data} bridgeStatus={bridgeStatus} onChange={settings => setData(current => ({ ...current, settings }))} onStatus={status => setBridgeStatus(normalizeStatus(status))} onRestore={restore} onPublicRefresh={refreshPublic} notify={notify} />}
    </div></main>
    <nav className="mobile-nav" aria-label="手机导航">{pages.filter(item => ['home', 'history', 'favorites'].includes(item.id)).map(({ id, label, icon: Icon }) => <a key={id} href={`#/${id}`} aria-current={page === id ? 'page' : undefined} className={page === id ? 'active' : ''} onClick={() => navigate(id)}><Icon size={21} /><span>{id === 'home' ? '任务' : label}</span></a>)}<button className={['library', 'ranking', 'sources', 'settings'].includes(page) ? 'active' : ''} onClick={() => setMobileMore(true)} aria-label="打开更多页面"><Menu size={21} /><span>更多</span></button></nav>
    {mobileMore ? <Modal title="更多" onClose={() => setMobileMore(false)}><nav className="more-nav">{pages.filter(item => ['library', 'ranking', 'sources', 'settings'].includes(item.id)).map(({ id, label, icon: Icon }) => <a key={id} href={`#/${id}`} onClick={() => navigate(id)}><Icon size={22} />{label}<ArrowRight size={17} /></a>)}</nav></Modal> : null}
    {detailSkill ? <SkillDetail skill={detailSkill} favorite={data.favoriteSkillIds.includes(detailSkill.id)} onFavorite={() => toggleSkillFavorite(detailSkill.id)} onClose={() => setDetailId(undefined)} onEdit={detailSkill.sourceType === 'import' || detailSkill.interpretationStatus !== 'ready' ? () => { setEditSkill(detailSkill); setDetailId(undefined); } : undefined} /> : null}
    {importOpen || editSkill ? <ImportSkillModal skills={data.skills} bridgeStatus={bridgeStatus} bridgeUrl={data.settings.bridgeUrl} existing={editSkill} onClose={() => { setImportOpen(false); setEditSkill(undefined); }} onSave={skill => { setData(current => ({ ...current, skills: mergeSkills(current.skills, [skill]) })); notify('能力已加入，你可以在首页按任务使用它。'); }} /> : null}
    {toast ? <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}><span>{toast.message}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setToast(undefined)}><X size={17} /></button></div> : null}
  </div>;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <div className="error-boundary"><h1>页面遇到了一个问题</h1><p>已经保存的数据还在。请刷新页面再试一次。</p><button className="primary-button" onClick={() => location.reload()}>重新打开</button></div> : this.props.children; }
}
