import { useMemo, useState } from 'react';
import { FileUp, LoaderCircle, Plus, Search } from 'lucide-react';
import type { BridgeStatus, Skill } from '../domain/types';
import { searchSkills } from '../core/SearchEngine';
import { interpretSkillMarkdown } from '../core/SkillInterpreter';
import { hasBridgeToken, interpretImportedSkill } from '../services/bridge';
import { EmptyState, errorMessage, Modal } from '../components/Modal';
import { SkillCard } from '../components/SkillCard';

export function Library({ skills, favorites, onFavorite, onDetail, onImport }: { skills: Skill[]; favorites: string[]; onFavorite: (id: string) => void; onDetail: (id: string) => void; onImport: () => void }) {
  const [query, setQuery] = useState(''); const [category, setCategory] = useState('');
  const categories = useMemo(() => [...new Set(skills.map(skill => skill.category))].sort(), [skills]);
  const results = useMemo(() => searchSkills(query, skills, category || undefined), [query, skills, category]);
  return <section className="library-page"><div className="page-header"><div><h1>能力库</h1><p>不知道名字也没关系，搜索你想做的事。</p></div><button className="primary-button" onClick={onImport}><Plus size={18} />导入能力</button></div>
    <div className="search-toolbar"><label className="search-field"><Search size={19} /><input aria-label="搜索能力" placeholder="例如：字幕、库存表、网页按钮坏了" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="按分类筛选" value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{categories.map(item => <option key={item}>{item}</option>)}</select></div>
    <p className="results-count">{results.length} 项能力</p>{results.length ? <div className="skill-grid">{results.map(skill => <SkillCard key={skill.id} skill={skill} favorite={favorites.includes(skill.id)} onFavorite={() => onFavorite(skill.id)} onDetail={() => onDetail(skill.id)} />)}</div> : <EmptyState title="还没有找到合适的能力" text="换一种说法试试，或导入你已经找到的能力。" />}
  </section>;
}

export function ImportSkillModal({ skills, bridgeStatus, bridgeUrl, localMode = false, existing, onSave, onClose }: { skills: Skill[]; bridgeStatus: BridgeStatus; bridgeUrl: string; localMode?: boolean; existing?: Skill; onSave: (skill: Skill) => void; onClose: () => void }) {
  const [markdown, setMarkdown] = useState(''); const [filename, setFilename] = useState('SKILL.md');
  const [preview, setPreview] = useState<Skill | undefined>(existing); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [chineseName, setChineseName] = useState(existing?.chineseName ?? '');
  const [description, setDescription] = useState(existing?.simpleDescription ?? '');
  const [category, setCategory] = useState(existing?.category ?? '其他');
  const [confirmed, setConfirmed] = useState(existing?.interpretationStatus === 'ready');
  async function analyze() {
    if (busy || !markdown.trim()) return; setBusy(true); setError(''); setNotice('');
    try {
      let skill: Skill;
      if (!localMode && bridgeStatus.connected && bridgeStatus.authMode === 'chatgpt' && hasBridgeToken()) {
        try { const result = await interpretImportedSkill(bridgeUrl, markdown, filename); skill = result.skill; if (result.notice) setNotice(result.notice); }
        catch (failure) { skill = interpretSkillMarkdown(markdown, filename); setNotice(`${errorMessage(failure)} 请补充中文名称和用途后再加入。`); }
      } else { skill = interpretSkillMarkdown(markdown, filename); setNotice(skill.interpretationStatus === 'ready' ? '识别到已有能力的说明，请检查下面的中文解释。' : `${localMode ? '正在使用本地推荐，不调用 AI。' : '未连接 AI。'}已读取原始内容，请补充中文名称和用途，不会把英文原文当作中文解释。`); }
      const ready = skill.interpretationStatus === 'ready';
      setPreview({ ...skill, sourceType: 'import' }); setChineseName(ready ? skill.chineseName : ''); setDescription(ready ? skill.simpleDescription : ''); setCategory(skill.category || '其他'); setConfirmed(ready);
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function readFile(file?: File) {
    if (!file || busy) return;
    if (file.size > 1024 * 1024) { setError('文件超过 1 MB，请只上传这个能力的说明文件。'); return; }
    if (!/\.md(?:own)?$/i.test(file.name)) { setError('请上传 Markdown 说明文件，例如 SKILL.md。'); return; }
    setBusy(true); setError('');
    try { setMarkdown(await file.text()); setFilename(file.name); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  function save() {
    if (!preview || !chineseName.trim() || !description.trim() || !confirmed || busy) return;
    if (!/[\u3400-\u9fff]/u.test(chineseName) || !/[\u3400-\u9fff]/u.test(description)) { setError('请用中文填写名称和一句话用途。'); return; }
    const saved = { ...preview, chineseName: chineseName.trim(), simpleDescription: description.trim(), category: category.trim() || '其他', interpretationStatus: 'ready' as const, updatedAt: new Date().toISOString() };
    const duplicate = skills.find(skill => skill.id === saved.id);
    if (duplicate && !existing && !window.confirm(`「${duplicate.chineseName}」已经在能力库中。用这次的内容更新它吗？`)) return;
    onSave(saved); onClose();
  }
  return <Modal title={existing ? '修改中文解释' : '导入一个能力'} onClose={onClose} wide busy={busy}>
    {!preview ? <><p>上传 SKILL.md，或直接粘贴能力的原始说明。</p><label className="file-upload"><FileUp size={20} /><span>{filename === 'SKILL.md' && !markdown ? '选择说明文件' : filename}</span><input type="file" accept=".md,.markdown,text/markdown" aria-label="上传能力说明文件" disabled={busy} onChange={event => void readFile(event.target.files?.[0])} /></label><label className="form-field"><span>原始内容</span><textarea className="markdown-input" value={markdown} disabled={busy} onChange={event => setMarkdown(event.target.value)} placeholder={'---\nname: your-skill\ndescription: ...\n---\n\n在这里粘贴原始说明'} maxLength={200000} /></label><div className="modal-actions"><button className="primary-button" disabled={busy || !markdown.trim()} onClick={() => void analyze()}>{busy ? <LoaderCircle className="spin" size={18} /> : null}{busy ? '正在理解这个能力' : '理解并生成中文解释'}</button></div></> : <>
      {notice ? <p className="notice">{notice}</p> : null}<p className="skill-english">{preview.name}</p><label className="form-field"><span>中文名称</span><input value={chineseName} onChange={event => setChineseName(event.target.value)} placeholder="例如：给视频加字幕" maxLength={80} /></label><label className="form-field"><span>一句话用途</span><textarea value={description} onChange={event => setDescription(event.target.value)} placeholder="用普通人能懂的话说，这个能力可以帮你做什么？" maxLength={500} /></label><label className="form-field"><span>分类</span><input value={category} onChange={event => setCategory(event.target.value)} maxLength={50} /></label><label className="checkbox-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我已确认中文名称和用途准确</label><details className="technical-details"><summary>查看原始内容</summary><pre>{preview.skillMarkdown}</pre></details><div className="modal-actions"><button className="primary-button" disabled={busy || !confirmed || !chineseName.trim() || !description.trim()} onClick={save}>{existing ? '保存解释' : '加入能力库'}</button>{!existing ? <button className="secondary-button" onClick={() => { setPreview(undefined); setNotice(''); setError(''); }}>返回修改内容</button> : null}</div>
    </>}{error ? <p className="error-message" role="alert">{error}</p> : null}
  </Modal>;
}
