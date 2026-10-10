import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ title, children, onClose, wide = false, busy = false, drawer = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; busy?: boolean; drawer?: boolean }) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  return createPortal(<div className={`modal-backdrop ${drawer ? 'modal-drawer-backdrop' : ''}`} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''} ${drawer ? 'modal-drawer' : ''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={dialog} onKeyDown={event => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const nodes = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]') ?? [])];
        const first = nodes[0]; const last = nodes.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
      }
    }}>
      <div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="关闭" disabled={busy} onClick={onClose}><X size={20} /></button></div>
      <div className="modal-content">{children}</div>
    </div>
  </div>, document.body);
}

export function EmptyState({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3><p>{text}</p>{children}</div>;
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : '操作没有完成，请重试。';
export function displayTime(value: string | null) {
  if (!value) return '还未检查';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '时间未知' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
