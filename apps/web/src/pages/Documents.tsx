import { useState, useEffect, useCallback } from 'react';
import { getAuthToken } from '@/lib/api';
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
  getDocumentPreviewUrl,
  getDocumentDownloadUrl,
  type DocumentView,
} from '@/lib/api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusBadge(status: DocumentView['textExtractionStatus']) {
  const styles: Record<DocumentView['textExtractionStatus'], string> = {
    complete: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    partial: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    missing: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  };
  const labels: Record<DocumentView['textExtractionStatus'], string> = {
    complete: 'Extracted',
    pending: 'Processing…',
    partial: 'Partial',
    failed: 'Failed',
    missing: 'No text',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function getTypeBadge(type: DocumentView['documentType']) {
  return (
    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
      {type === 'resume' ? 'Résumé' : 'Cover Letter'}
    </span>
  );
}

export function Documents() {
  const [docs, setDocs] = useState<DocumentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    // Guard: don't attempt API call without auth token
    if (!getAuthToken()) {
      setError('Not authenticated. Please sign in.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getDocuments();
      setDocs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)) {
      setError('Only PDF and DOCX files are supported.');
      return;
    }
    upload(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files);
  };

  const upload = async (file: File, type: 'resume' | 'cover-letter' = 'resume') => {
    if (!getAuthToken()) {
      setError('Not authenticated. Please sign in.');
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await uploadDocument(file, type);
      setMessage(`Uploaded "${res.originalFilename}" — text extraction: ${res.textExtractionStatus}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!getAuthToken()) {
      setError('Not authenticated. Please sign in.');
      return;
    }
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setError(null);
    try {
      await deleteDocument(id);
      setMessage(`Deleted "${name}"`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handlePreview = (id: string) => {
    if (!getAuthToken()) {
      setError('Not authenticated. Please sign in.');
      return;
    }
    window.open(getDocumentPreviewUrl(id), '_blank');
  };

  const handleDownload = (id: string) => {
    if (!getAuthToken()) {
      setError('Not authenticated. Please sign in.');
      return;
    }
    const a = document.createElement('a');
    a.href = getDocumentDownloadUrl(id);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="layer-panel p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Documents</h2>
        <label className="btn-primary">
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <input
            type="file"
            accept=".pdf,.docx"
            className="sr-only"
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={uploading}
          />
          {uploading ? 'Uploading…' : 'Upload'}
        </label>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept=".pdf,.docx"
          className="sr-only"
          onChange={(e) => handleFileSelect(e.target.files)}
          disabled={uploading}
          id="doc-upload"
        />
        <label htmlFor="doc-upload" className="cursor-pointer">
          <svg className="w-10 h-10 mx-auto text-slate-400 dark:text-slate-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {dragActive ? 'Drop PDF or DOCX here' : 'Drag & drop a résumé or cover letter (PDF/DOCX), or click to browse'}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Max 10 MB • Text will be extracted for AI scoring</p>
        </label>
        {uploading && <div className="mt-3 text-sm text-indigo-600 dark:text-indigo-400">Uploading and extracting text…</div>}
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}
      {message && (
        <div className="p-3 rounded border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
          {message}
        </div>
      )}

      {/* Document list */}
      {loading ? (
        <div className="text-center text-sm text-slate-500 dark:text-slate-400 py-8">Loading documents…</div>
      ) : docs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center">
          <svg className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-slate-500 dark:text-slate-400">No documents uploaded yet.</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Upload a résumé (PDF/DOCX) to enable AI job scoring.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">File</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Size</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Text Status</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Uploaded</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {docs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700 dark:text-slate-200 truncate max-w-xs">{doc.originalFilename}</div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">{doc.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">{getTypeBadge(doc.documentType)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono">{formatBytes(doc.size)}</td>
                  <td className="px-4 py-3">{getStatusBadge(doc.textExtractionStatus)}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">{formatDate(doc.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {doc.textExtractionStatus === 'complete' && doc.extractedText && (
                        <button
                          onClick={() => navigator.clipboard.writeText(doc.extractedText!)}
                          className="px-2.5 py-1.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                          title="Copy extracted text"
                        >
                          Copy Text
                        </button>
                      )}
                      <button
                        onClick={() => handlePreview(doc.id)}
                        className="px-2.5 py-1.5 rounded text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition"
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => handleDownload(doc.id)}
                        className="px-2.5 py-1.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition"
                      >
                        Download
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id, doc.originalFilename)}
                        disabled={uploading}
                        className="px-2.5 py-1.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}