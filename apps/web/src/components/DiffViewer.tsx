import { useState } from 'react';

interface ChangeItem {
  section: string;
  field: string;
  original?: string;
  proposed: string;
  reason: string;
  isNew: boolean;
}

interface DiffViewerProps {
  changes: ChangeItem[];
  onAcceptChange: (index: number) => void;
  onRejectChange: (index: number) => void;
  acceptedIndices?: Set<number>;
  rejectedIndices?: Set<number>;
}

export function DiffViewer({
  changes,
  onAcceptChange,
  onRejectChange,
  acceptedIndices = new Set(),
  rejectedIndices = new Set(),
}: DiffViewerProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        <svg className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="mt-2">No changes proposed</p>
        <p className="text-sm">Your resume already matches well for this role.</p>
      </div>
    );
  }

  // Group changes by section
  const changesBySection = changes.reduce((acc, change, index) => {
    if (!acc[change.section]) acc[change.section] = [];
    acc[change.section].push({ ...change, index });
    return acc;
  }, {} as Record<string, Array<ChangeItem & { index: number }>>);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {Object.entries(changesBySection).map(([section, sectionChanges]) => {
        const isExpanded = expandedSections.has(section);
        return (
          <div key={section} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(section)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-gray-900 dark:text-white capitalize">{section.replace(/_/g, ' ')}</span>
                <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full">
                  {sectionChanges.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                {sectionChanges.filter(c => !c.isNew && acceptedIndices.has(c.index)).length} accepted
                {sectionChanges.filter(c => !c.isNew && rejectedIndices.has(c.index)).length > 0 && (
                  <>
                    <span>·</span>
                    {sectionChanges.filter(c => !c.isNew && rejectedIndices.has(c.index)).length} rejected
                  </>
                )}
                {sectionChanges.filter(c => c.isNew && acceptedIndices.has(c.index)).length > 0 && (
                  <>
                    <span>·</span>
                    {sectionChanges.filter(c => c.isNew && acceptedIndices.has(c.index)).length} added
                  </>
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="divide-y divide-gray-200 dark:divide-gray-700 p-4 space-y-4">
                {sectionChanges.map(({ index, field, original, proposed, reason, isNew }) => {
                  const isAccepted = acceptedIndices.has(index);
                  const isRejected = rejectedIndices.has(index);
                  const isPending = !isAccepted && !isRejected;

                  return (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border transition-colors ${
                        isAccepted
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                          : isRejected
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-gray-900 dark:text-white">{field}</span>
                            {isNew && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 rounded-full">
                                New
                              </span>
                            )}
                            {isPending && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 rounded-full">
                                Pending
                              </span>
                            )}
                            {isAccepted && !isNew && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                                Accepted
                              </span>
                            )}
                            {isAccepted && isNew && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 rounded-full">
                                Added
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 rounded-full">
                                Rejected
                              </span>
                            )}
                          </div>

                          <div className="space-y-2">
                            {original !== undefined && (
                              <div className={`p-3 rounded border text-sm ${
                                isAccepted
                                  ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800 line-through text-gray-400'
                                  : isRejected
                                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                                  : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'
                              }`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Original</span>
                                  {isRejected && (
                                    <span className="text-xs text-red-600 dark:text-red-400">(will be removed)</span>
                                  )}
                                </div>
                                <pre className="whitespace-pre-wrap font-mono text-gray-700 dark:text-gray-300">{original}</pre>
                              </div>
                            )}

                            <div className={`p-3 rounded border text-sm ${
                              isAccepted
                                ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                                : isRejected
                                ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 line-through text-gray-400'
                                : 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800'
                            }`}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                  {isNew ? 'Proposed (New)' : original !== undefined ? 'Proposed' : 'Current'}
                                </span>
                                {isAccepted && (
                                  <span className="text-xs text-green-600 dark:text-green-400">✓ Applied</span>
                                )}
                              </div>
                              <pre className="whitespace-pre-wrap font-mono text-gray-900 dark:text-white">{proposed}</pre>
                            </div>
                          </div>

                          <div className="mt-2 p-2 bg-gray-50 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-400">
                            <strong>Reason:</strong> {reason}
                          </div>
                        </div>

                        {isPending && (
                          <div className="flex flex-col gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => onAcceptChange(index)}
                              className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                            >
                              {isNew ? 'Add' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              onClick={() => onRejectChange(index)}
                              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            >
                              {isNew ? 'Discard' : 'Reject'}
                            </button>
                          </div>
                        )}

                        {(isAccepted || isRejected) && (
                          <div className="shrink-0">
                            <span className={`px-3 py-1.5 text-sm font-medium rounded-lg ${
                              isAccepted
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                            }`}>
                              {isAccepted ? (isNew ? 'Added' : 'Accepted') : (isNew ? 'Discarded' : 'Rejected')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}