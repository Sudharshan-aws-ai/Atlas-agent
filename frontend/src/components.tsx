import React from 'react';

// Shared UI components — Apple-inspired Minimalist White Design

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-9 w-9' : 'h-6 w-6';
  return (
    <div className={`${s} animate-spin rounded-full border-2 border-slate-200 border-t-slate-900`} />
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-xl bg-white border border-rose-200/90 p-4 text-rose-800 text-sm shadow-xs flex items-start gap-3">
      <span className="text-rose-500 font-bold text-base leading-none mt-0.5">⚠️</span>
      <div>
        <strong className="font-semibold text-rose-900">Error:</strong> {message}
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  color = 'blue',
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
}) {
  const accentText = {
    blue: 'text-sky-600',
    green: 'text-emerald-600',
    yellow: 'text-amber-600',
    red: 'text-rose-600',
    purple: 'text-violet-600',
    gray: 'text-slate-700',
  };

  const accentPill = {
    blue: 'bg-sky-50 text-sky-700 border-sky-200/80',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200/80',
    yellow: 'bg-amber-50 text-amber-700 border-amber-200/80',
    red: 'bg-rose-50 text-rose-700 border-rose-200/80',
    purple: 'bg-violet-50 text-violet-700 border-violet-200/80',
    gray: 'bg-slate-50 text-slate-700 border-slate-200/80',
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/85 p-5 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.03)] hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.06)] hover:border-slate-300 transition-all duration-200 flex flex-col justify-between">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${accentPill[color]}`}>
          {color.toUpperCase()}
        </span>
      </div>
      <div className={`text-3xl font-extrabold tracking-tight font-mono my-2.5 ${accentText[color]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {sub && <div className="text-xs text-slate-500 font-medium">{sub}</div>}
    </div>
  );
}

export function SectionHeading({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
        {title || children}
      </h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function Table({
  columns,
  rows,
  emptyMsg = 'No records.',
}: {
  columns: { key: string; label: string; render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode }[];
  rows: Record<string, unknown>[];
  emptyMsg?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="text-sm text-slate-400 italic py-8 text-center bg-white rounded-xl border border-slate-200">
        {emptyMsg}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white shadow-xs">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50/75">
          <tr>
            {columns.map(c => (
              <th key={c.key} className="table-th">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-slate-50/70 transition-colors">
              {columns.map(c => (
                <td key={c.key} className="table-td">
                  {c.render
                    ? c.render(row[c.key], row)
                    : String(row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Badge({
  variant,
  children,
}: {
  variant: 'red' | 'yellow' | 'green' | 'blue' | 'gray' | 'purple';
  children: React.ReactNode;
}) {
  const styles = {
    red: 'bg-rose-50 text-rose-700 border border-rose-200/80',
    yellow: 'bg-amber-50 text-amber-800 border border-amber-200/80',
    green: 'bg-emerald-50 text-emerald-800 border border-emerald-200/80',
    blue: 'bg-sky-50 text-sky-700 border border-sky-200/80',
    purple: 'bg-violet-50 text-violet-700 border border-violet-200/80',
    gray: 'bg-slate-50 text-slate-700 border border-slate-200/80',
  };
  return <span className={`badge ${styles[variant] || styles.gray}`}>{children}</span>;
}

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1.5 border-b border-slate-200 mb-6 overflow-x-auto pb-0.5">
      {tabs.map(t => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`px-3.5 py-2 text-xs font-semibold transition-all whitespace-nowrap rounded-lg flex items-center gap-2 ${
              isActive
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <span
                className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
