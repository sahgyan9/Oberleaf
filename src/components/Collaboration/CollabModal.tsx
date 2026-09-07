import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  X,
  Copy,
  Check,
  Radio,
  Wifi,
  Globe,
  Loader2,
  Terminal,
} from 'lucide-react';
import { withSessionToken } from '../../session';

export interface CollabModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
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

type ShareMode = 'lan' | 'tunnel';

export const CollabModal: React.FC<CollabModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [shareMode, setShareMode] = useState<ShareMode>('lan');

  // Network & Tunnel state
  const [networkInfo, setNetworkInfo] = useState<{
    localIp: string;
    localUrl: string;
    isCloudflaredAvailable: boolean;
    tunnel: { isActive: boolean; url: string | null };
    shareToken?: string;
  } | null>(null);
  const [isStartingTunnel, setIsStartingTunnel] = useState<boolean>(false);
  const [tunnelError, setTunnelError] = useState<string | null>(null);

  // Fetch network information when modal opens
  const fetchNetworkStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/collab/network');
      if (res.ok) {
        const data = await res.json();
        setNetworkInfo(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchNetworkStatus();
    }
  }, [isOpen, fetchNetworkStatus]);

  useEffect(() => {
    if (initialRoomCode) {
      setRoom(initialRoomCode);
    } else if (!room) {
      setRoom(`oberleaf-${Math.random().toString(36).substring(2, 8)}`);
    }
  }, [initialRoomCode, isOpen, room]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleStartTunnel = async () => {
    setIsStartingTunnel(true);
    setTunnelError(null);
    try {
      const res = await fetch('/api/collab/tunnel/start', { method: 'POST' });
      const data = await res.json();
      if (data.success && data.url) {
        await fetchNetworkStatus();
      } else {
        setTunnelError(data.error || 'Failed to start tunnel.');
      }
    } catch (err: any) {
      setTunnelError(err.message || 'Error connecting to tunnel endpoint.');
    } finally {
      setIsStartingTunnel(false);
    }
  };

  const handleStopTunnel = async () => {
    try {
      await fetch('/api/collab/tunnel/stop', { method: 'POST' });
      await fetchNetworkStatus();
    } catch {}
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!room.trim() || !name.trim()) return;
    localStorage.setItem('oberleaf_author_name', name.trim());
    onStartCollab(room.trim(), name.trim(), selectedColor);
  };

  if (!isOpen) return null;

  // Compute invitation URLs. The session token rides along in the link: the
  // API rejects anything arriving from another machine without it, so the link
  // is the credential and should be shared the way a password would be.
  const shareToken = networkInfo?.shareToken;
  const lanBaseUrl = networkInfo?.localUrl || window.location.origin;
  const lanInviteUrl = withSessionToken(
    `${lanBaseUrl}/?project=${encodeURIComponent(projectId)}&room=${encodeURIComponent(room)}`,
    shareToken
  );
  const tunnelBaseUrl = networkInfo?.tunnel?.url;
  const tunnelInviteUrl = tunnelBaseUrl
    ? withSessionToken(
        `${tunnelBaseUrl}/?project=${encodeURIComponent(projectId)}&room=${encodeURIComponent(room)}`,
        shareToken
      )
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans p-4">
      <div className="w-full max-w-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-scholarly/10 dark:bg-scholarly-dark/20 text-scholarly dark:text-scholarly-dark flex items-center justify-center border border-scholarly/20">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold font-serif text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>Live Project Collaboration</span>
                <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-medium">
                  Host Mode
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Project: <span className="font-semibold text-stone-700 dark:text-stone-300">{projectName || projectId}</span>
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
          {/* Active Session Status */}
          {isCollabActive && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-emerald-700 dark:text-emerald-300 font-medium text-xs">
                  <Radio className="w-4 h-4 animate-pulse text-emerald-500" />
                  <span>Collaboration Session Active</span>
                </div>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-semibold">
                  {connectedPeersCount} {connectedPeersCount === 1 ? 'peer' : 'peers'} connected
                </span>
              </div>
              <p className="text-[11px] text-stone-600 dark:text-stone-300 font-mono">
                Room: {room}
              </p>
            </div>
          )}

          {/* Configuration Form (when inactive) */}
          {!isCollabActive && (
            <form onSubmit={handleStart} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Your Author Name
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
                  <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                    Room Code
                  </label>
                  <input
                    type="text"
                    value={room}
                    onChange={(e) => setRoom(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 font-mono"
                  />
                </div>
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
                      className={`w-6 h-6 rounded-full transition transform ${
                        selectedColor === c.color ? 'scale-120 ring-2 ring-offset-2 ring-stone-400' : 'opacity-75 hover:opacity-100'
                      }`}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  disabled={!room.trim() || !name.trim()}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium transition disabled:opacity-50"
                >
                  <Radio className="w-4 h-4" />
                  <span>Start Live Session</span>
                </button>
              </div>
            </form>
          )}

          {/* Sharing Hub (Visible when active, or can be pre-configured) */}
          {isCollabActive && (
            <div className="space-y-4 pt-1">
              {/* Tabs: LAN vs Tunnel */}
              <div className="flex rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle p-1 border border-surface-lightBorder dark:border-surface-darkBorder">
                <button
                  type="button"
                  onClick={() => setShareMode('lan')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-1.5 text-xs font-medium rounded-lg transition ${
                    shareMode === 'lan'
                      ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <Wifi className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                  <span>Local Wi-Fi / LAN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShareMode('tunnel')}
                  className={`flex-1 flex items-center justify-center space-x-2 py-1.5 text-xs font-medium rounded-lg transition ${
                    shareMode === 'tunnel'
                      ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                      : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200'
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                  <span>Internet Tunnel</span>
                </button>
              </div>

              {/* Mode A: Local Network / Wi-Fi */}
              {shareMode === 'lan' && (
                <div className="space-y-3 p-4 rounded-xl bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                        Direct Local Wi-Fi Connection
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        Zero internet latency. Ideal for colleagues on the same Wi-Fi, office, or university network.
                      </p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                      {networkInfo?.localIp || 'Detecting...'}
                    </span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      readOnly
                      value={lanInviteUrl}
                      className="flex-1 px-3 py-2 rounded-xl text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-stone-700 dark:text-stone-300 select-all"
                    />
                    <button
                      type="button"
                      onClick={() => handleCopy(lanInviteUrl, 'lan')}
                      className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark text-white text-xs font-medium hover:bg-scholarly-hover transition flex-shrink-0"
                    >
                      {copiedKey === 'lan' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copiedKey === 'lan' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Mode B: Cloudflare Quick Tunnel */}
              {shareMode === 'tunnel' && (
                <div className="space-y-3 p-4 rounded-xl bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-xs font-semibold text-stone-800 dark:text-stone-200">
                        Cloudflare Outbound HTTPS Tunnel
                      </h3>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        Secure end-to-end link for collaborators anywhere in the world with zero router configuration.
                      </p>
                    </div>
                  </div>

                  {/* Cloudflared not installed diagnosis */}
                  {networkInfo && !networkInfo.isCloudflaredAvailable && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-2">
                      <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                        cloudflared is not detected in your system PATH.
                      </p>
                      <p className="text-[11px] text-stone-600 dark:text-stone-400">
                        To enable instant public tunnels without port forwarding, run:
                      </p>
                      <div className="flex items-center space-x-2">
                        <code className="flex-1 px-2.5 py-1.5 rounded bg-surface-lightPanel dark:bg-surface-darkPanel font-mono text-[11px] text-stone-800 dark:text-stone-200 border border-surface-lightBorder dark:border-surface-darkBorder">
                          winget install Cloudflare.cloudflared
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy('winget install Cloudflare.cloudflared', 'winget')}
                          className="px-2.5 py-1.5 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 text-xs hover:bg-stone-200 dark:hover:bg-stone-800 transition"
                        >
                          {copiedKey === 'winget' ? <Check className="w-3.5 h-3.5" /> : <Terminal className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tunnel Active */}
                  {networkInfo?.tunnel?.isActive && tunnelInviteUrl && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={tunnelInviteUrl}
                          className="flex-1 px-3 py-2 rounded-xl text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-stone-700 dark:text-stone-300 select-all"
                        />
                        <button
                          type="button"
                          onClick={() => handleCopy(tunnelInviteUrl, 'tunnel')}
                          className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark text-white text-xs font-medium hover:bg-scholarly-hover transition flex-shrink-0"
                        >
                          {copiedKey === 'tunnel' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedKey === 'tunnel' ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleStopTunnel}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          Stop Tunnel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Tunnel Inactive & cloudflared available */}
                  {networkInfo?.isCloudflaredAvailable && !networkInfo?.tunnel?.isActive && (
                    <div className="space-y-2">
                      {tunnelError && (
                        <p className="text-xs text-red-600 dark:text-red-400">{tunnelError}</p>
                      )}
                      <button
                        type="button"
                        onClick={handleStartTunnel}
                        disabled={isStartingTunnel}
                        className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium transition disabled:opacity-50"
                      >
                        {isStartingTunnel ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Creating Quick Tunnel...</span>
                          </>
                        ) : (
                          <>
                            <Globe className="w-4 h-4" />
                            <span>Create Public HTTPS Tunnel</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Leave Session */}
              <div className="pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex justify-end">
                <button
                  type="button"
                  onClick={onStopCollab}
                  className="px-4 py-2 rounded-xl border border-red-500/30 text-red-600 hover:bg-red-500/10 text-xs font-medium transition"
                >
                  Leave Collaboration Session
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
