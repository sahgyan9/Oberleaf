import React from 'react';
import { X, Upload, CheckCircle2, AlertCircle, Loader2, Ban } from 'lucide-react';

export interface UploadFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'waiting' | 'uploading' | 'imported' | 'failed' | 'cancelled';
  error?: string;
  relativePath?: string;
}

interface UploadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: UploadFileItem[];
  onCancelItem: (id: string) => void;
  onCancelAll: () => void;
}

export const UploadProgressModal: React.FC<UploadProgressModalProps> = ({
  isOpen,
  onClose,
  files,
  onCancelItem,
  onCancelAll,
}) => {
  if (!isOpen || files.length === 0) return null;

  const totalFiles = files.length;
  const importedCount = files.filter((f) => f.status === 'imported').length;
  const failedCount = files.filter((f) => f.status === 'failed').length;
  const isAllFinished = files.every(
    (f) => f.status === 'imported' || f.status === 'failed' || f.status === 'cancelled'
  );

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-lg rounded-xl p-5 shadow-2xl space-y-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3 flex-shrink-0">
          <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-semibold text-sm">
            <Upload className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
            <span>Importing Files ({importedCount}/{totalFiles})</span>
          </div>
          <button
            onClick={onClose}
            disabled={!isAllFinished}
            title={isAllFinished ? 'Close' : 'Waiting for uploads to finish'}
            className="p-1 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 rounded disabled:opacity-30 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="flex-shrink-0 space-y-1.5">
          <div className="w-full bg-stone-200 dark:bg-stone-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-scholarly-green dark:bg-scholarly-greenDark h-full transition-all duration-300 rounded-full"
              style={{ width: `${(importedCount / totalFiles) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] text-stone-500 dark:text-stone-400">
            <span>
              {isAllFinished
                ? `Import complete: ${importedCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}`
                : 'Processing files locally...'}
            </span>
            <span>{Math.round((importedCount / totalFiles) * 100)}%</span>
          </div>
        </div>

        {/* File List (Internally Scrollable) */}
        <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px] max-h-[50vh]">
          {files.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-2.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-xs"
            >
              <div className="flex items-center space-x-2.5 min-w-0 flex-1 mr-2">
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {item.status === 'uploading' && (
                    <Loader2 className="w-4 h-4 text-scholarly-blue animate-spin" />
                  )}
                  {item.status === 'imported' && (
                    <CheckCircle2 className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                  )}
                  {item.status === 'failed' && (
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  )}
                  {item.status === 'waiting' && (
                    <div className="w-4 h-4 rounded-full border border-stone-400 border-dashed" />
                  )}
                  {item.status === 'cancelled' && (
                    <Ban className="w-4 h-4 text-stone-400" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-stone-800 dark:text-stone-200 truncate">
                      {item.name}
                    </span>
                    <span className="text-[10px] text-stone-400 font-mono flex-shrink-0">
                      {formatBytes(item.size)}
                    </span>
                  </div>
                  {item.error && (
                    <p className="text-[11px] text-rose-500 mt-0.5 truncate">{item.error}</p>
                  )}
                  {item.relativePath && (
                    <p className="text-[10px] text-scholarly-blue mt-0.5 font-mono truncate">
                      {item.relativePath}
                    </p>
                  )}
                </div>
              </div>

              {/* Action Button */}
              {(item.status === 'waiting' || item.status === 'uploading') && (
                <button
                  onClick={() => onCancelItem(item.id)}
                  title="Cancel this upload"
                  className="p-1 rounded text-stone-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          {!isAllFinished ? (
            <button
              onClick={onCancelAll}
              className="text-xs text-rose-600 hover:text-rose-700 dark:text-rose-400 font-medium transition"
            >
              Cancel All Pending
            </button>
          ) : (
            <span className="text-xs text-scholarly-green dark:text-scholarly-greenDark font-medium">All operations finished</span>
          )}

          <button
            onClick={onClose}
            disabled={!isAllFinished}
            className="px-4 py-1.5 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark text-white disabled:opacity-50 text-xs font-semibold shadow-xs transition btn-tactile"
          >
            {isAllFinished ? 'Done' : 'Uploading...'}
          </button>
        </div>
      </div>
    </div>
  );
};
