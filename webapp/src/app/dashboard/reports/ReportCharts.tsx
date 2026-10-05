'use client';

import { useId, useState } from 'react';
import { FOLLOW_UP_STATUSES, reportPercent, type FollowUpStatus, type ReportGroup } from '@/lib/visit-reports';
import styles from './page.module.css';

export function BarChart({ title, groups, total, selected = '', onSelect, groupLabel = 'kategori' }: {
  title: string; groups: ReportGroup[]; total: number; selected?: string; onSelect?: (key: string) => void; groupLabel?: string;
}) {
  const id = useId(), [expanded, setExpanded] = useState(false);
  const shown = expanded ? groups : groups.slice(0, 8);
  return <section className={`${styles.panel} ${styles.barPanel}`} aria-labelledby={id}>
    <header className={styles.panelHeading}><div><h2 id={id}>{title}</h2><p className={styles.chartHint}>{onSelect ? 'Pilih kategori untuk melihat rinciannya.' : 'Distribusi hasil dari catatan kunjungan.'}</p></div><span>{groups.length} {groupLabel}</span></header>
    <div className={styles.chartScale} aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div>
    <div className={styles.bars}>
      {shown.map(group => {
        const content = <><span className={styles.barLabel}>{group.label}</span><span className={styles.barNumber}><strong>{group.count}</strong> usaha <small>{reportPercent(group.count, total)}%</small></span><span className={styles.track} aria-hidden="true"><span className={!onSelect ? styles.prospectFill : undefined} style={{ width: `${total ? group.count / total * 100 : 0}%` }} /></span></>;
        return onSelect ? <button key={group.key} type="button" className={styles.barRow} aria-pressed={selected === group.key} onClick={() => onSelect(selected === group.key ? '' : group.key)}>{content}</button>
          : <div key={group.key} className={styles.barRow}>{content}</div>;
      })}
    </div>
    {groups.length > 8 && <button type="button" className={`btn btn-secondary ${styles.expandChart}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Tampilkan 8 teratas' : `Lihat semua ${groups.length} ${groupLabel}`}</button>}
    <p className={styles.chartFootnote}>Persentase dari {total} usaha yang ditampilkan.</p>
  </section>;
}

export function StatusChart({ counts, total, selected, onSelect }: {
  counts: Record<FollowUpStatus, number>; total: number; selected: string; onSelect: (key: string) => void;
}) {
  const id = useId(), circumference = 2 * Math.PI * 66;
  const [highlighted, setHighlighted] = useState<FollowUpStatus | null>(null);
  const segments = FOLLOW_UP_STATUSES.filter(status => counts[status.key] > 0).length;
  const active = FOLLOW_UP_STATUSES.find(status => status.key === highlighted);
  return <section className={`${styles.panel} ${styles.statusPanel}`} aria-labelledby={id} onMouseLeave={() => setHighlighted(null)}>
    <header className={styles.panelHeading}><div><h2 id={id}>Status tindak lanjut</h2><p className={styles.chartHint}>Pilih status untuk memfilter laporan.</p></div></header>
    <div className={styles.donutLayout}>
      <div className={styles.donut} aria-hidden="true">
        <svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="66" fill="none" stroke="#fffdf9" strokeWidth="24" />
          {FOLLOW_UP_STATUSES.map((status, index) => {
            const length = total ? counts[status.key] / total * circumference : 0;
            const start = total ? FOLLOW_UP_STATUSES.slice(0, index).reduce((sum, preceding) => sum + counts[preceding.key], 0) / total * circumference : 0;
            const gap = segments > 1 ? Math.min(4, length / 4) : 0;
            return length ? <circle key={status.key} className={styles.donutSegment} cx="90" cy="90" r="66" fill="none" stroke={status.color} strokeWidth={highlighted === status.key ? 29 : 24} strokeDasharray={segments > 1 ? `${length - gap} ${circumference - length + gap}` : undefined} strokeDashoffset={-start - gap / 2} transform="rotate(-90 90 90)" onMouseEnter={() => setHighlighted(status.key)} onClick={() => onSelect(selected === status.key ? '' : status.key)} /> : null;
          })}
        </svg><div><strong style={active ? { color: active.color } : undefined}>{active ? counts[active.key] : total}</strong><span>{active ? active.label : 'Total usaha'}</span>{active && <small>{reportPercent(counts[active.key], total)}% dari kunjungan</small>}</div>
      </div>
      <div className={styles.legend}>
        {FOLLOW_UP_STATUSES.map(status => <button key={status.key} type="button" aria-pressed={selected === status.key} onMouseEnter={() => setHighlighted(status.key)} onFocus={() => setHighlighted(status.key)} onBlur={() => setHighlighted(null)} onClick={() => onSelect(selected === status.key ? '' : status.key)}>
          <span className={styles.swatch} style={{ background: status.color }} aria-hidden="true" /><span>{status.label}<small>{reportPercent(counts[status.key], total)}% dari kunjungan</small></span><strong>{counts[status.key]}</strong><span className={styles.legendArrow} aria-hidden="true">›</span>
        </button>)}
      </div>
    </div>
  </section>;
}
