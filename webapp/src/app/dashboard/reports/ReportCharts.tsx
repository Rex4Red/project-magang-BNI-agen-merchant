'use client';

import { useId, useState } from 'react';
import { FOLLOW_UP_STATUSES, reportPercent, type FollowUpStatus, type ReportGroup } from '@/lib/visit-reports';
import styles from './page.module.css';

export function BarChart({ title, groups, total, selected = '', onSelect, groupLabel = 'kategori' }: {
  title: string; groups: ReportGroup[]; total: number; selected?: string; onSelect?: (key: string) => void; groupLabel?: string;
}) {
  const id = useId(), [expanded, setExpanded] = useState(false);
  const shown = expanded ? groups : groups.slice(0, 8);
  const maximum = Math.max(1, ...groups.map(group => group.count));
  return <section className={styles.panel} aria-labelledby={id}>
    <header className={styles.panelHeading}><h2 id={id}>{title}</h2><span>Jumlah usaha</span></header>
    {onSelect && <p className={styles.chartHint}>Klik kategori untuk memfilter laporan.</p>}
    <div className={styles.bars}>
      {shown.map(group => {
        const content = <><span className={styles.barLabel}>{group.label}</span><span className={styles.track} aria-hidden="true"><span style={{ width: `${group.count / maximum * 100}%` }} /></span><span className={styles.barNumber}>{group.count}<small>{reportPercent(group.count, total)}%</small></span></>;
        return onSelect ? <button key={group.key} type="button" className={styles.barRow} aria-pressed={selected === group.key} onClick={() => onSelect(selected === group.key ? '' : group.key)}>{content}</button>
          : <div key={group.key} className={styles.barRow}>{content}</div>;
      })}
    </div>
    {groups.length > 8 && <button type="button" className={`btn btn-secondary ${styles.expandChart}`} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Tampilkan 8 teratas' : `Lihat semua ${groups.length} ${groupLabel}`}</button>}
  </section>;
}

export function StatusChart({ counts, total, selected, onSelect }: {
  counts: Record<FollowUpStatus, number>; total: number; selected: string; onSelect: (key: string) => void;
}) {
  const id = useId(), circumference = 2 * Math.PI * 66;
  const segments = FOLLOW_UP_STATUSES.filter(status => counts[status.key] > 0).length;
  return <section className={styles.panel} aria-labelledby={id}>
    <header className={styles.panelHeading}><h2 id={id}>Status tindak lanjut</h2></header>
    <div className={styles.donutLayout}>
      <div className={styles.donut} aria-hidden="true">
        <svg viewBox="0 0 180 180"><circle cx="90" cy="90" r="66" fill="none" stroke="#fffdf9" strokeWidth="20" />
          {FOLLOW_UP_STATUSES.map((status, index) => {
            const length = total ? counts[status.key] / total * circumference : 0;
            const start = total ? FOLLOW_UP_STATUSES.slice(0, index).reduce((sum, preceding) => sum + counts[preceding.key], 0) / total * circumference : 0;
            const gap = segments > 1 ? Math.min(3, length / 4) : 0;
            return length ? <circle key={status.key} cx="90" cy="90" r="66" fill="none" stroke={status.color} strokeWidth="20" strokeDasharray={`${length - gap} ${circumference - length + gap}`} strokeDashoffset={-start - gap / 2} transform="rotate(-90 90 90)" /> : null;
          })}
        </svg><div><strong>{total}</strong><span>usaha</span></div>
      </div>
      <div className={styles.legend}>
        {FOLLOW_UP_STATUSES.map(status => <button key={status.key} type="button" aria-pressed={selected === status.key} onClick={() => onSelect(selected === status.key ? '' : status.key)}>
          <span className={styles.swatch} style={{ background: status.color }} aria-hidden="true" /><span>{status.label}<small>{reportPercent(counts[status.key], total)}%</small></span><strong>{counts[status.key]}</strong>
        </button>)}
      </div>
    </div>
    <p className={styles.chartHint}>Klik status untuk memfilter laporan.</p>
  </section>;
}
