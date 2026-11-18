import { useState, useEffect } from 'react';
import type { ResumeTemplateView, CoverLetterTemplateView } from '../lib/api';
import {
  listResumeTemplates,
  listCoverLetterTemplates,
  createResumeTemplate,
  createCoverLetterTemplate,
} from '../lib/api';

interface TemplateSelectorProps {
  type: 'resume' | 'cover-letter';
  selectedId?: string;
  onSelect: (templateId: string) => void;
  onCreateNew?: () => void;
  className?: string;
}

export function TemplateSelector({
  type,
  selectedId,
  onSelect,
  onCreateNew,
  className = '',
}: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<(ResumeTemplateView | CoverLetterTemplateView)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [type]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const data = type === 'resume'
        ? await listResumeTemplates()
        : await listCoverLetterTemplates();
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!newTemplateName.trim()) return;
    try {
      setCreating(true);
      if (type === 'resume') {
        const template = await createResumeTemplate({
          name: newTemplateName,
          description: newTemplateDescription || undefined,
          htmlTemplate: '', // Will use default
          cssTemplate: '',
        });
        setTemplates(prev => [...prev, template]);
        onSelect(template.id);
      } else {
        const template = await createCoverLetterTemplate({
          name: newTemplateName,
          description: newTemplateDescription || undefined,
          htmlTemplate: '',
          cssTemplate: '',
        });
        setTemplates(prev => [...prev, template]);
        onSelect(template.id);
      }
      setShowCreateModal(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="animate-pulse space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>
        <button
          type="button"
          onClick={loadTemplates}
          className="text-sm text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-900 dark:text-white capitalize">
          {type === 'resume' ? 'Resume' : 'Cover Letter'} Template
        </h3>
        {onCreateNew && (
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            + Create Custom
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map(template => (
          <button
            key={template.id}
            type="button"
            onClick={() => onSelect(template.id)}
            className={`p-4 rounded-lg border-2 text-left transition-all ${
              selectedId === template.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium text-gray-900 dark:text-white">{template.name}</div>
                {template.description && (
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {template.description}
                  </div>
                )}
              </div>
              {template.isSystem && (
                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-full">
                  System
                </span>
              )}
            </div>
            {template.isDefault && (
              <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Default
              </div>
            )}
            {selectedId === template.id && (
              <div className="mt-2 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Selected
              </div>
            )}
          </button>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p>No templates available</p>
          {onCreateNew && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Create your first template
            </button>
          )}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Create {type === 'resume' ? 'Resume' : 'Cover Letter'} Template
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Template Name
                </label>
                <input
                  type="text"
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  placeholder="e.g., Modern Tech Resume"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description (optional)
                </label>
                <textarea
                  value={newTemplateDescription}
                  onChange={e => setNewTemplateDescription(e.target.value)}
                  placeholder="Brief description of this template..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateTemplate}
                disabled={creating || !newTemplateName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              >
                {creating ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}