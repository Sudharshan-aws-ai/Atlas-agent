// Shared UI components

export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';
  return (
    <div className={`${s} animate-spin rounded-full border-2 border-gray-200 border-t-blue-600`} />
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-700 text-sm">
      <strong>Error:</strong> {message}
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
  const colorMap = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    green: 'bg-green-50 border-green-100 text-green-900',
    yellow: 'bg-yellow-50 border-yellow-100 text-yellow-900',
    red: 'bg-red-50 border-red-100 text-red-900',
    purple: 'bg-purple-50 border-purple-100 text-purple-900',
    gray: 'bg-gray-50 border-gray-100 text-gray-900',
  };
  return (
    <div className={`rounded-xl border p-5 ${colorMap[color]}`}>
      <div className="text-3xl font-bold">{value.toLocaleString()}</div>
      <div className="text-sm font-semibold mt-1 opacity-80">{label}</div>
      {sub && <div className="text-xs mt-1 opacity-60">{sub}</div>}
    </div>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
      {children}
    </h2>
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
      <div className="text-sm text-gray-400 italic py-6 text-center">{emptyMsg}</div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-100 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(c => (
              <th key={c.key} className="table-th">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
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
  variant: 'red' | 'yellow' | 'green' | 'blue' | 'gray';
  children: React.ReactNode;
}) {
  return <span className={`badge-${variant}`}>{children}</span>;
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
    <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === t.id
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {t.label}
          {t.count !== undefined && (
            <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
              active === t.id ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
            }`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
