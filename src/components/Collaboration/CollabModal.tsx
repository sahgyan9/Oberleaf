import React, { useState, useEffect } from 'react';
import {
  Users,
  X,
  Copy,
  Check,
  Radio,
} from 'lucide-react';

export interface CollabModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  isCollabActive: boolean;
  onStartCollab: (room: string, name: string, color: string) => void;
  onStopCollab: () => void;
  connectedPeersCount: number;
}

const AUTHOR_COLORS = [
  { name: 'Indigo', color: '#2F39A9' },
  { name: 'Mint', color: '#15D8B3' },
  { name: 'Coral', color: '#FF6B6B' },
  { name: 'Violet', color: '#845EC2' },
  { name: 'Amber', color: '#FF9671' },
];

export const CollabModal: React.FC<CollabModalProps> = ({
  isOpen,
  onClose,
  roomCode: initialRoomCode,
  isCollabActive,
  onStartCollab,
  onStopCollab,
  connectedPeersCount,
}) => {
  const [room, setRoom] = useState<string>('');
  const [name, setName] = useState<string>(() => {
    return localStorage.getItem('oberleaf_author_name') || 'Collaborator';
  });
  const [selectedColor, setSelectedColor] = useState<string>(AUTHOR_COLORS[0].color);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (initialRoomCode) {
      setRoom(initialRoomCode);
    } else if (!room) {
      setRoom(`oberleaf-${Math.random().toString(36).substring(2, 8)}`);
    }
  }, [initialRoomCode, isOpen]);

  const handleCopyLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', room);
    navigator.clipboard.writeText(url.toString());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room.trim() || !name.trim()) return;
    localStorage.setItem('oberleaf_author_name', name.trim());
    onStartCollab(room.trim(), name.trim(), selectedColor);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans p-4">
      <div className="w-full max-w-md bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-scholarly/10 dark:bg-scholarly-dark/20 text-scholarly dark:text-scholarly-dark flex items-center justify-center border border-scholarly/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold font-serif text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>Real-Time Collaboration</span>
                <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  Peer-to-Peer
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Live Google Docs-style co-editing with zero cloud subscriptions
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {isCollabActive ? (
            <div className="space-y-4">
              {/* Active Session Status */}
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 font-medium text-xs">
                    <Radio className="w-4 h-4 animate-pulse text-emerald-500" />
                    <span>Live Session Active</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                    {connectedPeersCount} {connectedPeersCount === 1 ? 'peer' : 'peers'} connected
                  </span>
                </div>
                <p className="text-[11px] text-stone-600 dark:text-stone-300">
                  Room: <code className="font-mono font-bold">{room}</code>
                </p>
              </div>

              {/* Share link button */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300">
                  Share Room Link with Co-Authors
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}${window.location.pathname}?room=${room}`}
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-stone-700 dark:text-stone-300"
                  />
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark text-white text-xs font-medium hover:bg-scholarly-hover transition"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Stop collaboration */}
              <div className="pt-2 border-t border-surface-lightBorder dark:border-surface-darkBorder flex justify-end">
                <button
                  type="button"
                  onClick={onStopCollab}
                  className="px-4 py-2 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs font-medium transition"
                >
                  Leave Live Session
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStart} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Room Code / Paper ID
                </label>
                <input
                  type="text"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                  placeholder="e.g. oberleaf-my-paper"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                  Your Name (appears on remote cursor)
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dr. Jane Smith"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 font-sans"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1.5">
                  Cursor Color
                </label>
                <div className="flex items-center space-x-3">
                  {AUTHOR_COLORS.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setSelectedColor(c.color)}
                      style={{ backgroundColor: c.color }}
                      className={`w-7 h-7 rounded-full transition transform ${
                        selectedColor === c.color ? 'scale-115 ring-2 ring-offset-2 ring-stone-400' : 'opacity-80 hover:opacity-100'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder text-stone-600 dark:text-stone-300 text-xs hover:bg-surface-lightSubtle transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!room.trim() || !name.trim()}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium transition disabled:opacity-50 shadow-xs"
                >
                  <Radio className="w-4 h-4" />
                  <span>Start Live Session</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
