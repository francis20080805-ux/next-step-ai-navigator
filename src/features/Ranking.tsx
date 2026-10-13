import { useMemo, useState } from 'react';
import { ChevronRight, Search, Star, Trophy } from 'lucide-react';
import type { Skill, TaskCategory } from '../domain/types';
import { rankSkills, type RankingMode } from '../core/SkillRanking';
import { EmptyState } from '../components/Modal';

const categories: { value: 'all' | TaskCategory; label: string }[] = [
  { value: 'all', label: '全部用途' },
  { value: 'video', label: '视频' },
  { value: 'spreadsheet', label: '表格' },
  { value: 'presentation', label: 'PPT' },
  { value: 'website', label: '网页' },
  { value: 'image', label: '图片' },
  { value: 'document', label: '文档' },
  { value: 'pdf', label: 'PDF' },
  { value: 'research', label: '研究' },
  { value: 'design', label: '设计' },
  { value: 'email', label: '邮件' },
  { value: 'calendar', label: '日程' },
  { value: 'other', label: '其他' },
];

export function Ranking({ skills, favorites, onFavorite, onDetail }: {
  skills: Skill[];
  favorites: string[];
  onFavorite: (id: string) => void;
  onDetail: (id: string) => void;
}) {
  const [mode, setMode] = useState<RankingMode>('recommended');
  const [category, setCategory] = useState<'all' | TaskCategory>('all');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const ranked = useMemo(() => rankSkills(skills, { mode, category, query, limit: skills.length }), [skills, mode, category, query]);
  const favoriteIds = useMemo(() => new Set(favorites), [favorites]);
  const visible = ranked.slice(0, visibleCount);

  return <section className="ranking-page">
    <div className="page-header"><div><h1>推荐榜</h1><p>从常见用途和仓库热度出发，找到值得试试的能力。</p></div><Trophy className="ranking-header-icon" size={26} aria-hidden="true" /></div>
    <div className="ranking-modes" role="group" aria-label="排行榜类型">
      <button className={mode === 'recommended' ? 'active' : ''} aria-pressed={mode === 'recommended'} onClick={() => { setMode('recommended'); setVisibleCount(20); }}>推荐榜</button>
      <button className={mode === 'stars' ? 'active' : ''} aria-pressed={mode === 'stars'} onClick={() => { setMode('stars'); setVisibleCount(20); }}>高星榜</button>
    </div>
    <div className="search-toolbar">
      <label className="search-field"><Search size={19} /><input aria-label="搜索排行榜" placeholder="例如：剪视频、做表格、remotion" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(20); }} /></label>
      <select aria-label="按用途筛选排行榜" value={category} onChange={event => { setCategory(event.target.value as 'all' | TaskCategory); setVisibleCount(20); }}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </div>
    <div className="ranking-summary"><p className="results-count">{ranked.length} 项能力{ranked.length > visibleCount ? ` · 先看前 ${visibleCount} 项` : ''}</p><details className="ranking-rules"><summary>怎么排的？</summary><p>推荐榜综合常见用途、维护状态和已获取的 GitHub 仓库热度；高星榜按真实仓库 star 数排序。用途未确认或已停用的能力不进榜。同一仓库下的能力共用仓库 star，收藏不会改变排名。目录收录不代表已在 Codex 中安装，打开详情可查看来源和所需工具。</p></details></div>
    {visible.length ? <ol className="ranking-list" aria-label={mode === 'recommended' ? '推荐能力排名' : '高星能力排名'}>
      {visible.map(item => <li key={item.skill.id} className="ranking-row">
        <span className={`ranking-number ${item.rank <= 3 ? 'ranking-number-top' : ''}`} aria-label={`第 ${item.rank} 名`}>{item.rank}</span>
        <article className="ranking-card">
          <div className="card-heading"><button className="card-title-button" onClick={() => onDetail(item.skill.id)}><h3>{item.skill.chineseName}</h3></button><button className={`icon-button ${favoriteIds.has(item.skill.id) ? 'favorited' : ''}`} aria-label={favoriteIds.has(item.skill.id) ? `取消收藏${item.skill.chineseName}` : `收藏${item.skill.chineseName}`} aria-pressed={favoriteIds.has(item.skill.id)} onClick={() => onFavorite(item.skill.id)}><Star size={18} fill={favoriteIds.has(item.skill.id) ? 'currentColor' : 'none'} /></button></div>
          <p className="ranking-description" title={item.skill.simpleDescription}>{item.skill.simpleDescription}</p><small className="skill-english" title={item.skill.name}>{item.skill.name}</small>
          <div className="ranking-card-footer"><span className="ranking-reason" title={item.reason}>{item.reason}</span>{item.stars !== null ? <span className="ranking-stars" title={item.repo ? `${item.repo} 的仓库 star 数` : '所属仓库的 star 数'}>仓库 star {item.stars.toLocaleString('zh-CN')}</span> : null}<button className="text-button" onClick={() => onDetail(item.skill.id)}>详情<ChevronRight size={15} /></button></div>
        </article>
      </li>)}
    </ol> : <EmptyState title={query || category !== 'all' ? '这个用途暂时没有上榜能力' : mode === 'stars' ? '还没有获取到仓库热度' : '推荐榜正在等待能力目录'} text={query || category !== 'all' ? '换个关键词或选择全部用途再试试。' : '到能力来源获取公开目录；中文用途确认后，合适的能力会出现在这里。'} />}
    {ranked.length > visibleCount ? <div className="ranking-load-more"><button className="secondary-button" onClick={() => setVisibleCount(count => count + 20)}>再看 {Math.min(20, ranked.length - visibleCount)} 项</button></div> : null}
  </section>;
}
