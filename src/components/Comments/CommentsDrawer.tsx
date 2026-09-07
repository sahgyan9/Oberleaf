import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  X,
  Plus,
  CornerDownRight,
  Trash2,
  FileCode,
  Send,
} from 'lucide-react';

export interface CommentReply {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  file: string;
  line: number;
  selectedText?: string;
  author: string;
  text: string;
  createdAt: string;
  status: 'open' | 'resolved';
  replies: CommentReply[];
}

export interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  activeFilePath: string;
  cursorLine?: number;
  selectedText?: string;
  onJumpToLine?: (file: string, line: number) => void;
  onCommentsUpdated?: (openCount: number) => void;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  activeFilePath,
  cursorLine = 1,
  selectedText = '',
  onJumpToLine,
  onCommentsUpdated,
}) => {
  const [threads, setThreads] = useState<CommentThread[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [filterMode, setFilterMode] = useState<'current_file' | 'all'>('current_file');
  const [showResolved, setShowResolved] = useState<boolean>(false);

  // New Comment Form
  const [newCommentText, setNewCommentText] = useState<string>('');
  const [authorName, setAuthorName] = useState<string>(() => {
    return localStorage.getItem('oberleaf_author_name') || 'Reviewer';
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Reply state
  const [replyTextMap, setReplyTextMap] = useState<{ [threadId: string]: string }>({});
  const [activeReplyThreadId, setActiveReplyThreadId] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`);
      if (res.ok) {
        const data: CommentThread[] = await res.json();
        setThreads(data);
        const openCount = data.filter((t) => t.status === 'open').length;
        if (onCommentsUpdated) onCommentsUpdated(openCount);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [projectId, onCommentsUpdated]);

  useEffect(() => {
    if (isOpen) {
      fetchComments();
    }
  }, [isOpen, fetchComments]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isSubmitting) return;

    setIsSubmitting(true);
    localStorage.setItem('oberleaf_author_name', authorName.trim() || 'Reviewer');

    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: activeFilePath,
          line: cursorLine,
          selectedText: selectedText.trim() || undefined,
          author: authorName.trim() || 'Reviewer',
          text: newCommentText.trim(),
        }),
      });

      if (res.ok) {
        setNewCommentText('');
        await fetchComments();
      }
    } catch {
      // ignore
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddReply = async (threadId: string) => {
    const text = replyTextMap[threadId];
    if (!text || !text.trim()) return;

    try {
      const res = await fetch(`/api/projects/${projectId}/comments/${threadId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: authorName.trim() || 'Reviewer',
          text: text.trim(),
        }),
      });

      if (res.ok) {
        setReplyTextMap((prev) => ({ ...prev, [threadId]: '' }));
        setActiveReplyThreadId(null);
        await fetchComments();
      }
    } catch {
      // ignore
    }
  };

  const handleToggleStatus = async (threadId: string, currentStatus: 'open' | 'resolved') => {
    const nextStatus = currentStatus === 'open' ? 'resolved' : 'open';
    try {
      const res = await fetch(`/api/projects/${projectId}/comments/${threadId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        await fetchComments();
      }
    } catch {
      // ignore
    }
  };

  const handleDeleteComment = async (threadId: string) => {
    if (!window.confirm('Delete this comment thread?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/comments/${threadId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchComments();
      }
    } catch {
      // ignore
    }
  };

  const formatCommentDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const filteredThreads = threads.filter((t) => {
    if (filterMode === 'current_file' && t.file !== activeFilePath) return false;
    if (!showResolved && t.status === 'resolved') return false;
    return true;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans">
      <div className="w-full max-w-md h-full bg-surface-lightPanel dark:bg-surface-darkPanel border-l border-surface-lightBorder dark:border-surface-darkBorder flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="h-14 px-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-scholarly/10 dark:bg-scholarly-dark/20 text-scholarly dark:text-scholarly-dark flex items-center justify-center border border-scholarly/20">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-serif font-semibold text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>Review Comments</span>
                <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                  .comments.json
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Persistent across Git clones, offline-ready
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls */}
        <div className="px-4 py-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between text-xs flex-shrink-0">
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setFilterMode('current_file')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                filterMode === 'current_file'
                  ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              Current File
            </button>
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                filterMode === 'all'
                  ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              All Project ({threads.length})
            </button>
          </div>

          <label className="flex items-center space-x-1.5 cursor-pointer text-[11px] text-stone-500 select-none">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="rounded border-stone-300 text-scholarly focus:ring-0 w-3 h-3"
            />
            <span>Resolved</span>
          </label>
        </div>

        {/* New Comment Input Box */}
        <div className="p-4 border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-light dark:bg-surface-dark flex-shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
            <span className="flex items-center space-x-1">
              <FileCode className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
              <span>{activeFilePath}:Line {cursorLine}</span>
            </span>
            <input
              type="text"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Your Name"
              className="px-2 py-0.5 rounded text-[11px] bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-800 dark:text-stone-200 font-sans"
            />
          </div>

          {selectedText && (
            <div className="p-2 rounded bg-amber-500/10 border-l-2 border-amber-500 text-[11px] text-amber-800 dark:text-amber-200 italic line-clamp-2">
              "{selectedText}"
            </div>
          )}

          <form onSubmit={handleAddComment} className="space-y-2">
            <textarea
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Add review comment or suggestion..."
              rows={2}
              className="w-full p-2 rounded-xl text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 font-sans"
            />
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!newCommentText.trim() || isSubmitting}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium transition disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Comment</span>
              </button>
            </div>
          </form>
        </div>

        {/* Comments Thread List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredThreads.length === 0 && !isLoading && (
            <div className="py-12 text-center text-xs text-stone-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30 text-stone-500" />
              <p>No comments in this view.</p>
              <p className="text-[10px] text-stone-500 mt-1">
                Select text in the editor and click "Add Comment" above.
              </p>
            </div>
          )}

          {filteredThreads.map((thread) => (
            <div
              key={thread.id}
              className={`p-3.5 rounded-xl border transition text-xs space-y-2.5 ${
                thread.status === 'resolved'
                  ? 'bg-surface-lightSubtle/60 dark:bg-surface-darkSubtle/40 border-surface-lightBorder opacity-70'
                  : 'bg-surface-lightPanel dark:bg-surface-darkPanel border-surface-lightBorder dark:border-surface-darkBorder shadow-xs'
              }`}
            >
              {/* Thread Header */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onJumpToLine && onJumpToLine(thread.file, thread.line)}
                  className="flex items-center space-x-1.5 text-[11px] font-mono font-medium text-scholarly dark:text-scholarly-dark hover:underline"
                >
                  <FileCode className="w-3 h-3" />
                  <span>{thread.file}:{thread.line}</span>
                </button>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-stone-400">
                    {formatCommentDate(thread.createdAt)}
                  </span>
                  <button
                    aria-label={thread.status === 'open' ? 'Mark as Resolved' : 'Re-open comment'}
                    type="button"
                    onClick={() => handleToggleStatus(thread.id, thread.status)}
                    title={thread.status === 'open' ? 'Mark as Resolved' : 'Re-open comment'}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition ${
                      thread.status === 'open'
                        ? 'bg-amber-500/10 text-amber-600 hover:bg-emerald-500/20 hover:text-emerald-600'
                        : 'bg-emerald-500/10 text-emerald-600 hover:bg-amber-500/20 hover:text-amber-600'
                    }`}
                  >
                    {thread.status === 'open' ? 'Resolve' : 'Resolved'}
                  </button>
                  <button
                    aria-label="Delete thread"
                    type="button"
                    onClick={() => handleDeleteComment(thread.id)}
                    title="Delete thread"
                    className="p-1 text-stone-400 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Quoted Text */}
              {thread.selectedText && (
                <div className="p-2 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border-l-2 border-scholarly text-[11px] text-stone-600 dark:text-stone-300 italic">
                  "{thread.selectedText}"
                </div>
              )}

              {/* Comment Content */}
              <div>
                <div className="text-[11px] font-semibold text-stone-900 dark:text-stone-100 mb-0.5">
                  {thread.author}
                </div>
                <p className="text-stone-800 dark:text-stone-200 leading-relaxed font-sans">
                  {thread.text}
                </p>
              </div>

              {/* Replies */}
              {thread.replies && thread.replies.length > 0 && (
                <div className="pl-3 border-l-2 border-stone-200 dark:border-stone-800 space-y-2 pt-1">
                  {thread.replies.map((reply) => (
                    <div key={reply.id} className="text-xs space-y-0.5">
                      <div className="flex items-center justify-between text-[10px] text-stone-500">
                        <span className="font-semibold text-stone-800 dark:text-stone-200">{reply.author}</span>
                        <span>{formatCommentDate(reply.createdAt)}</span>
                      </div>
                      <p className="text-stone-700 dark:text-stone-300">{reply.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Reply Input */}
              {activeReplyThreadId === thread.id ? (
                <div className="flex items-center space-x-1.5 pt-1">
                  <input
                    type="text"
                    value={replyTextMap[thread.id] || ''}
                    onChange={(e) =>
                      setReplyTextMap((prev) => ({ ...prev, [thread.id]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddReply(thread.id);
                      }
                    }}
                    placeholder="Write a reply..."
                    className="flex-1 px-2.5 py-1 rounded-lg text-xs bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly text-stone-900 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddReply(thread.id)}
                    className="p-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark text-white hover:bg-scholarly-hover transition"
                  >
                    <Send className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReplyThreadId(null)}
                    className="p-1.5 rounded-lg text-stone-400 hover:text-stone-600 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveReplyThreadId(thread.id)}
                  className="flex items-center space-x-1 text-[11px] text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark font-medium pt-1"
                >
                  <CornerDownRight className="w-3 h-3" />
                  <span>Reply</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
