import { useState } from 'react';
import { ArrowRight, Search, Star, Trash2 } from 'lucide-react';
import type { Skill, TaskRecord } from '../domain/types';
import { displayTime, EmptyState } from '../components/Modal';
import { SkillCard } from '../components/SkillCard';

function TaskList({ tasks, onOpen, onFavorite, onDelete }: { tasks: TaskRecord[]; onOpen: (task: TaskRecord) => void; onFavorite: (task: TaskRecord) => void; onDelete?: (id: string) => void }) {
  return <div className="task-list">{tasks.map(task => {
    const current = task.steps.find(step => step.status === 'pending');
    return <article className="history-card" key={task.id}><button className="history-open" onClick={() => onOpen(task)}><h3>{task.title}</h3><p>{current ? `下一步：${current.title}` : '任务步骤已完成'}</p><span className="history-meta">{displayTime(task.updatedAt)} · {task.steps.filter(step => step.status === 'completed').length}/{task.steps.length} 步完成</span></button><div className="history-actions"><button className={`icon-button ${task.favorite ? 'favorited' : ''}`} aria-label={task.favorite ? '取消收藏任务' : '收藏任务'} aria-pressed={task.favorite} onClick={() => onFavorite(task)}><Star size={19} fill={task.favorite ? 'currentColor' : 'none'} /></button>{onDelete ? <button className="icon-button" aria-label={`删除任务${task.title}`} onClick={() => { if (window.confirm(`删除「${task.title}」的记录吗？`)) onDelete(task.id); }}><Trash2 size={18} /></button> : null}<button className="text-button" onClick={() => onOpen(task)}>继续<ArrowRight size={16} /></button></div></article>;
  })}</div>;
}

export function History({ tasks, onOpen, onFavorite, onDelete }: { tasks: TaskRecord[]; onOpen: (task: TaskRecord) => void; onFavorite: (task: TaskRecord) => void; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState(''); const [filter, setFilter] = useState('all');
  const results = tasks.filter(task => (filter === 'all' || (filter === 'completed' ? task.status === 'completed' : task.status !== 'completed')) && `${task.title} ${task.originalInput}`.toLowerCase().includes(query.toLowerCase()));
  return <section><div className="page-header"><div><h1>任务历史</h1><p>上次做到哪里，这次接着来。</p></div></div><div className="search-toolbar"><label className="search-field"><Search size={19} /><input aria-label="搜索任务历史" placeholder="搜索以前的任务" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="任务状态" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部任务</option><option value="ongoing">进行中</option><option value="completed">已完成</option></select></div>{results.length ? <TaskList tasks={results} onOpen={onOpen} onFavorite={onFavorite} onDelete={onDelete} /> : <EmptyState title={tasks.length ? '没有找到这个任务' : '还没有任务记录'} text={tasks.length ? '换个关键词，或看看其他状态的任务。' : '在首页说说你想做什么，第一个任务会保存在这里。'} />}</section>;
}

export function Favorites({ tasks, skills, favoriteSkillIds, onOpen, onTaskFavorite, onSkillFavorite, onDetail }: { tasks: TaskRecord[]; skills: Skill[]; favoriteSkillIds: string[]; onOpen: (task: TaskRecord) => void; onTaskFavorite: (task: TaskRecord) => void; onSkillFavorite: (id: string) => void; onDetail: (id: string) => void }) {
  const [tab, setTab] = useState<'task' | 'skill'>('task');
  const favoriteTasks = tasks.filter(task => task.favorite); const favoriteSkills = skills.filter(skill => favoriteSkillIds.includes(skill.id));
  return <section><div className="page-header"><div><h1>收藏</h1><p>把常用的流程和能力放在一起。</p></div></div><div className="tabs" role="tablist" aria-label="收藏内容"><button role="tab" aria-selected={tab === 'task'} className={tab === 'task' ? 'active' : ''} onClick={() => setTab('task')}>任务流程</button><button role="tab" aria-selected={tab === 'skill'} className={tab === 'skill' ? 'active' : ''} onClick={() => setTab('skill')}>常用能力</button></div>{tab === 'task' ? favoriteTasks.length ? <TaskList tasks={favoriteTasks} onOpen={onOpen} onFavorite={onTaskFavorite} /> : <EmptyState title="还没有收藏任务" text="点击任务标题旁的星星，下次可以快速接着做。" /> : favoriteSkills.length ? <div className="skill-grid">{favoriteSkills.map(skill => <SkillCard key={skill.id} skill={skill} favorite onFavorite={() => onSkillFavorite(skill.id)} onDetail={() => onDetail(skill.id)} />)}</div> : <EmptyState title="还没有收藏能力" text="在能力库中点击星星，常用能力就会出现在这里。" />}</section>;
}
