export type Theme = 'light' | 'dark' | 'system';
export type Page = 'dashboard' | 'jobs' | 'searches' | 'documents' | 'settings';

const NAV: { key: Page; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'jobs', label: 'Jobs' },
  { key: 'searches', label: 'Searches' },
  { key: 'documents', label: 'Documents' },
  { key: 'settings', label: 'Settings' },
];

export function Sidebar({ currentPage, onSelect }: { currentPage: Page; onSelect: (p: Page) => void }) {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="p-4">
        <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase mb-4">JobNavigator</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <button
              key={item.key}
              onClick={() => onSelect(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                currentPage === item.key
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
