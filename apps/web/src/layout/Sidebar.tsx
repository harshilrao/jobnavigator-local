import { NavLink } from 'react-router-dom';

export type Theme = 'light' | 'dark' | 'system';
export type Page =
  | 'dashboard'
  | 'jobs'
  | 'searches'
  | 'documents'
  | 'settings'
  | 'login'
  | 'scrape';

export interface User {
  id: string;
  email: string;
}

const NAV: { key: Page; label: string; path: string }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/' },
  { key: 'jobs', label: 'Jobs', path: '/jobs' },
  { key: 'scrape', label: 'Scrape', path: '/scrape' },
  { key: 'searches', label: 'Searches', path: '/searches' },
  { key: 'documents', label: 'Documents', path: '/documents' },
  { key: 'settings', label: 'Settings', path: '/settings' },
];

export function Sidebar({
  user,
  onLogout,
}: {
  user: User | null;
  onLogout: () => void;
}) {
  return (
    <aside className="w-64 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="p-4">
        <div className="text-sm font-semibold tracking-wide text-slate-500 uppercase mb-4">JobNavigator</div>
        <nav className="space-y-1">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.path}
              className={({ isActive }) => `w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="p-3 border-t border-slate-200 dark:border-slate-800 mt-auto">
        {user ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                {user.email}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="w-full py-2 px-3 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 transition"
            >
              Log out
            </button>
          </div>
        ) : (
          <NavLink
            to="/login"
            className="w-full py-2 px-3 rounded-lg text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-900/40 transition"
          >
            Sign in
          </NavLink>
        )}
      </div>
    </aside>
  );
}