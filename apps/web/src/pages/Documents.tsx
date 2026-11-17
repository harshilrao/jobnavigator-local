export function Documents() {
  return (
    <div className="layer-panel p-6">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Documents</h2>
      <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">No documents uploaded yet.</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Resume/cover-letter upload and GridFS storage come in Phase 2.</p>
      </div>
    </div>
  );
}
