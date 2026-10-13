import { Star, ChevronRight } from 'lucide-react';
import type { Skill } from '../domain/types';
import { displayTime, Modal } from './Modal';

export const maintenanceNames: Record<Skill['maintenanceStatus'], string> = { active: '可用', stale: '较久未更新', deprecated: '可能停止维护', removed: '来源已删除', unavailable: '暂时无法使用' };
const stageNames: Record<Skill['stage'], string> = { prepare: '准备时', design: '设计时', create: '制作时', edit: '修改时', check: '检查时', error: '出现问题时', export: '导出时', publish: '发布时' };
const sourceNames: Record<Skill['sourceType'], string> = { system: '内置能力', github: '自动发现', import: '自己导入' };

export function SkillCard({ skill, favorite, onFavorite, onDetail }: { skill: Skill; favorite: boolean; onFavorite: () => void; onDetail: () => void }) {
  return <article className="skill-card">
    <div className="card-heading"><button className="card-title-button" onClick={onDetail}><h3>{skill.chineseName}</h3></button><button className={`icon-button ${favorite ? 'favorited' : ''}`} aria-label={favorite ? `取消收藏${skill.chineseName}` : `收藏${skill.chineseName}`} aria-pressed={favorite} onClick={onFavorite}><Star size={19} fill={favorite ? 'currentColor' : 'none'} /></button></div>
    <p>{skill.simpleDescription}</p><small className="skill-english">{skill.name}</small>
    <div className="card-footer"><span>{skill.category} · {sourceNames[skill.sourceType]}</span>{skill.interpretationStatus !== 'ready' ? <span className="badge badge-warning">用途待确认</span> : skill.maintenanceStatus !== 'active' ? <span className="badge badge-warning">{maintenanceNames[skill.maintenanceStatus]}</span> : null}<button className="text-button" onClick={onDetail}>详细信息<ChevronRight size={15} /></button></div>
  </article>;
}

export function SkillDetail({ skill, favorite, onFavorite, onClose, onEdit }: { skill: Skill; favorite: boolean; onFavorite: () => void; onClose: () => void; onEdit?: () => void }) {
  return <Modal title={skill.chineseName} onClose={onClose} wide drawer>
    <p className="detail-summary">{skill.simpleDescription}</p><p className="skill-english">{skill.name}</p>
    {skill.sourceType === 'github' ? <p className="muted">这是公开来源的能力说明。执行时需要 Codex 确认已安装该 Skill，并检查所需账号和工具连接。</p> : null}
    <div className="detail-actions"><button className="secondary-button" onClick={onFavorite}><Star size={17} fill={favorite ? 'currentColor' : 'none'} />{favorite ? '已收藏' : '收藏这个能力'}</button>{onEdit ? <button className="secondary-button" onClick={onEdit}>修改中文解释</button> : null}</div>
    <dl className="detail-list"><div><dt>适合做什么</dt><dd>{skill.taskTypes.join('、') ? skill.userPhrases.join('、') || skill.tags.join('、') || skill.category : skill.category}</dd></div><div><dt>什么时候使用</dt><dd>{stageNames[skill.stage]}{skill.conditions.length ? `；${skill.conditions.join('；')}` : ''}</dd></div><div><dt>什么时候不需要</dt><dd>{skill.excludeConditions.join('；') || '根据任务内容判断'}</dd></div><div><dt>常见说法</dt><dd>{skill.userPhrases.join('、') || '暂未添加'}</dd></div><div><dt>来源与状态</dt><dd>{sourceNames[skill.sourceType]} · {maintenanceNames[skill.maintenanceStatus]}{skill.interpretationStatus !== 'ready' ? ' · 中文解释待确认' : ''}</dd></div><div><dt>更新时间</dt><dd>{displayTime(skill.updatedAt)}</dd></div></dl>
    {skill.githubUrl.startsWith('https://github.com/') ? <a className="source-link" href={skill.githubUrl} target="_blank" rel="noreferrer">查看 GitHub 来源<ChevronRight size={16} /></a> : null}
    <details className="technical-details"><summary>原始内容与技术信息</summary><dl className="detail-list"><div><dt>所属 Plugin</dt><dd>{skill.pluginId || '独立能力'}</dd></div><div><dt>版本</dt><dd>{skill.version || '未注明'}</dd></div><div><dt>前置能力</dt><dd>{skill.prerequisites.join('、') || '无'}</dd></div><div><dt>后续能力</dt><dd>{skill.nextSkills.join('、') || '根据任务决定'}</dd></div><div><dt>原始说明</dt><dd>{skill.description}</dd></div></dl><pre>{skill.skillMarkdown || '这个能力通过连接使用，没有独立说明文件。'}</pre></details>
  </Modal>;
}
