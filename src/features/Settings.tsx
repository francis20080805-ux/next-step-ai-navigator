import { useState } from 'react';
import { CheckCircle2, Download, LoaderCircle, Unplug, Upload } from 'lucide-react';
import type { AppData, BridgeStatus } from '../domain/types';
import { downloadBackup, validateBackup } from '../services/StorageLayer';
import { disconnectBridge, getBridgeBackup, getBridgeStatus, hasBridgeToken, pairBridge, restoreBridgeBackup, setAutomaticChecks, validBridgeUrl } from '../services/bridge';
import { errorMessage } from '../components/Modal';
import { normalModeUrl } from '../services/RuntimeMode';

export function Settings({ data, bridgeStatus, localMode = false, onChange, onStatus, onRestore, onPublicRefresh, notify }: { data: AppData; bridgeStatus: BridgeStatus; localMode?: boolean; onChange: (settings: AppData['settings']) => void; onStatus: (status: BridgeStatus) => void; onRestore: (data: AppData) => Promise<void>; onPublicRefresh: (url: string) => Promise<void>; notify: (message: string, kind?: 'error' | 'success') => void }) {
  const [url, setUrl] = useState(data.settings.bridgeUrl); const [code, setCode] = useState(''); const [publicUrl, setPublicUrl] = useState(data.settings.publicCatalogUrl);
  const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const paired = hasBridgeToken();
  async function pair() {
    if (busy || !code.trim()) return; setBusy('pair'); setError('');
    try {
      const base = validBridgeUrl(url.trim()); await pairBridge(base, code.trim()); const status = await getBridgeStatus(base);
      const connected = status.connected && status.authMode === 'chatgpt' && hasBridgeToken();
      onChange({ ...data.settings, bridgeUrl: base, automaticChecks: status.backgroundEnabled }); onStatus({ ...status, connected }); setCode('');
      if (!connected) { setError(status.message || '本机服务已配对，但 Codex 尚未使用 ChatGPT 登录。你可以先管理能力来源，登录后再检查 AI 连接。'); return; }
      notify(localMode ? '本机服务已连接，当前继续使用本地推荐。' : '已连接，现在可以用 AI 理解复杂任务。');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function automaticChecks(enabled: boolean) {
    if (busy || localMode) return; setBusy('checks'); setError('');
    try {
      if (hasBridgeToken()) { await setAutomaticChecks(data.settings.bridgeUrl, enabled); onStatus({ ...bridgeStatus, backgroundEnabled: enabled }); }
      onChange({ ...data.settings, automaticChecks: enabled }); notify(enabled ? '已开启后台检查。' : '已暂停后台检查。');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function restore(file?: File) {
    if (!file || busy) return; setBusy('restore'); setError('');
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error('备份文件超过 25 MB，无法恢复。');
      const next = validateBackup(JSON.parse(await file.text()));
      if (!window.confirm('恢复备份会替换这台设备上的任务、收藏和导入能力。建议先导出当前备份。继续恢复吗？')) return;
      await onRestore(next); notify('备份已恢复。');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function syncPublic() {
    if (busy || !publicUrl.trim()) return; setBusy('public'); setError('');
    try { await onPublicRefresh(publicUrl.trim()); onChange({ ...data.settings, publicCatalogUrl: publicUrl.trim() }); notify('公共能力库已更新。'); }
    catch (failure) { setError(`${errorMessage(failure)} 已保留现有能力目录，可以继续使用。`); }
    finally { setBusy(''); }
  }
  async function checkConnection() {
    if (busy) return; setBusy('status'); setError('');
    try { const status = await getBridgeStatus(data.settings.bridgeUrl); onStatus({ ...status, connected: status.connected && status.authMode === 'chatgpt' && hasBridgeToken() }); if (!status.connected || status.authMode !== 'chatgpt') setError(status.message || '本机服务可用，但 Codex 尚未准备好。'); else notify(localMode ? '本机服务已连接，当前继续使用本地推荐。' : 'AI 已连接。'); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function exportBridge() {
    if (busy || !paired) return; setBusy('bridge-export'); setError('');
    try {
      const backup = await getBridgeBackup(data.settings.bridgeUrl);
      const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `下一步本机目录-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000); notify('本机目录备份已准备好下载。');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  async function restoreBridge(file?: File) {
    if (!file || busy || !paired) return; setBusy('bridge-restore'); setError('');
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('本机目录备份超过 30 MB，无法恢复。');
      const backup = JSON.parse(await file.text());
      if (!backup || backup.kind !== 'ai-navigator-bridge-backup' || backup.schemaVersion !== 1) throw new Error('请选择本机目录备份；浏览器任务备份需要在“这台设备的数据”中恢复。');
      if (!window.confirm('恢复本机目录会替换本机服务的能力来源、作者关注、原始说明和检查记录。浏览器中的任务历史不受影响。继续吗？')) return;
      const result = await restoreBridgeBackup(data.settings.bridgeUrl, backup); if (!result.restored) throw new Error('本机目录恢复没有完成，请重试。'); notify(`本机目录已恢复，包含 ${result.skillCount} 项能力与 ${result.sourceCount} 个来源。`);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(''); }
  }
  return <section className="settings-page"><div className="page-header"><div><h1>设置</h1><p>连接你常用的 AI，也照顾好这台设备上的数据。</p></div></div>
    <section className="settings-card"><div className="settings-heading"><h2>任务理解</h2><span className={`badge ${!localMode && bridgeStatus.connected ? 'badge-success' : ''}`}>{localMode ? '正在使用本地推荐' : bridgeStatus.connected ? 'AI 已连接' : '本地推荐可用'}</span></div><p>{localMode ? '本地模式直接安排常见任务，不调用 AI，也不会修改你之前保存的 AI 偏好。' : bridgeStatus.connected ? '通过你电脑上已登录的 Codex 理解需求，不需要在这里填写 API 密钥。' : '连接前，可以使用本地规则安排常见任务。连接后，AI 会理解更复杂的需求。'}</p>{localMode ? <p><a className="text-button" href={normalModeUrl(location.href)}>切换到可选 AI 的普通本机入口</a><br /><small className="muted">真实 AI 理解仍需要 Codex 的在线服务可以访问。切换后会保留当前任务和收藏。</small></p> : null}<label className="switch-row"><span><strong>优先使用 AI 理解任务</strong><small>{localMode ? '本地模式暂不启用；原来的偏好保持不变。' : '连接不可用时，会明确切换到本地规则。'}</small></span><input type="checkbox" role="switch" checked={!localMode && data.settings.preferAI} disabled={Boolean(busy) || localMode} onChange={event => onChange({ ...data.settings, preferAI: event.target.checked })} /></label>
      {paired ? <div className="connected-row"><CheckCircle2 size={18} /><span>{bridgeStatus.connected ? '已连接本机 Codex' : '本机服务已配对，AI 暂未就绪'}</span>{!bridgeStatus.connected ? <button className="text-button" disabled={Boolean(busy)} onClick={() => void checkConnection()}>重新检查 AI 连接</button> : null}<button className="text-button" disabled={Boolean(busy)} onClick={() => { disconnectBridge(); onStatus({ ...bridgeStatus, connected: false, authMode: 'none', message: '正在使用本地推荐' }); notify('已断开连接，本地任务和能力都保留。'); }}><Unplug size={16} />断开连接</button></div> : <form className="connection-form" onSubmit={event => { event.preventDefault(); void pair(); }}><label className="form-field"><span>本机连接地址</span><input type="url" value={url} disabled={Boolean(busy)} onChange={event => setUrl(event.target.value)} placeholder="http://127.0.0.1:8787" required /></label><label className="form-field"><span>连接码</span><input value={code} type="password" autoComplete="off" disabled={Boolean(busy)} onChange={event => setCode(event.target.value)} placeholder="从本机服务窗口复制连接码" required /></label><button className="primary-button" type="submit" disabled={Boolean(busy) || !code.trim()}>{busy === 'pair' ? <LoaderCircle className="spin" size={18} /> : null}连接 Codex</button><p className="muted">连接码只用于这次配对。需要电脑上运行本机服务，并用 ChatGPT 登录 Codex。</p></form>}
    </section>
    <section className="settings-card"><h2>自动发现</h2>{localMode ? <><p>本地页面使用随附目录，不自动下载联网更新。通过桌面入口新启动的本机服务默认暂停联网巡检和 AI 解释，保留之前的设置；切到普通入口后，可以手动开启。若复用了以前启动的服务，以它的实际状态为准。</p>{paired ? <p className="muted">当前本机后台检查{bridgeStatus.backgroundEnabled ? '正在运行' : '已暂停'}。</p> : null}</> : <><label className="switch-row"><span><strong>定期检查来源更新</strong><small>{paired ? '本机服务会在后台检查新增和更新。' : '连接本机服务后开始后台检查。'}</small></span><input type="checkbox" role="switch" disabled={Boolean(busy)} checked={paired ? bridgeStatus.backgroundEnabled : data.settings.automaticChecks} onChange={event => void automaticChecks(event.target.checked)} /></label><p className="muted">后台检查需要本机服务保持运行。只打开网页不会自动执行电脑上的任务。</p></>}</section>
    <section className="settings-card"><h2>这台设备的数据</h2><p>任务历史、收藏和自己导入的能力保存在当前浏览器。换设备前，可以带走一份备份。</p>{localMode ? <p className="muted">原在线网页的数据保存在另一个网址下。如果那里已有任务，请先在原网页导出备份，再到这里恢复；本地模式与普通本机入口共用当前数据。</p> : null}<div className="settings-actions"><button className="secondary-button" disabled={Boolean(busy)} onClick={() => { downloadBackup(data); notify('备份文件已准备好下载。'); }}><Download size={17} />导出备份</button><label className={`secondary-button file-button ${busy ? 'disabled' : ''}`}><Upload size={17} />{busy === 'restore' ? '正在恢复' : '恢复备份'}<input type="file" accept="application/json,.json" disabled={Boolean(busy)} aria-label="选择应用备份文件" onChange={event => { void restore(event.target.files?.[0]); event.target.value = ''; }} /></label></div></section>
    <details className="settings-card advanced-settings"><summary>高级设置</summary><label className="form-field"><span>公共能力库地址</span><input value={publicUrl} disabled={Boolean(busy)} placeholder="https://网站地址/catalog.json" onChange={event => setPublicUrl(event.target.value)} /></label><p className="muted">从可信来源读取能力目录，不会执行里面的代码。</p><button className="secondary-button" disabled={Boolean(busy) || !publicUrl.trim()} onClick={() => void syncPublic()}>{busy === 'public' ? <LoaderCircle className="spin" size={17} /> : null}获取最新能力库</button><div className="subsection-heading"><h3>本机服务的能力目录</h3></div><p className="muted">单独备份本机服务中的来源、作者关注、原始说明和检查记录。需要先配对，不包含登录凭据，也不包含浏览器任务。</p><div className="settings-actions"><button className="secondary-button" disabled={Boolean(busy) || !paired} onClick={() => void exportBridge()}>{busy === 'bridge-export' ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}导出本机目录</button><label className={`secondary-button file-button ${busy || !paired ? 'disabled' : ''}`}><Upload size={17} />{busy === 'bridge-restore' ? '正在恢复本机目录' : '恢复本机目录'}<input type="file" accept="application/json,.json" disabled={Boolean(busy) || !paired} aria-label="选择本机目录备份文件" onChange={event => { void restoreBridge(event.target.files?.[0]); event.target.value = ''; }} /></label></div></details>
    {error ? <div className="error-message" role="alert">{error}</div> : null}
  </section>;
}
