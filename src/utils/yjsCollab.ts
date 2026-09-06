import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { MonacoBinding } from 'y-monaco';

export interface CollabSessionConfig {
  room: string;
  name: string;
  color: string;
  filePath?: string;
  onPeersChange?: (count: number) => void;
  onRemoteCompile?: (timestamp: number) => void;
}

// Module-level singletons so file-switching reuses the same WebRTC peer connection
let activeRoom: string | null = null;
let activeDoc: Y.Doc | null = null;
let activeProvider: WebrtcProvider | null = null;
let activeBinding: MonacoBinding | null = null;
let stylesInjected = false;

function injectRemoteCursorStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  const styleEl = document.createElement('style');
  styleEl.id = 'oberleaf-collab-styles';
  styleEl.innerHTML = `
    .yRemoteSelection {
      opacity: 0.25;
      border-radius: 2px;
    }
    .yRemoteSelectionHead {
      position: absolute;
      box-sizing: border-box;
      height: 100%;
      border-left: 2px solid currentColor;
    }
    .yRemoteSelectionHead::after {
      position: absolute;
      content: attr(data-user-name);
      top: -1.25em;
      left: -2px;
      font-size: 10px;
      line-height: 1;
      padding: 2px 4px;
      border-radius: 3px;
      background-color: currentColor;
      color: #ffffff;
      font-family: inherit;
      font-weight: 600;
      white-space: nowrap;
      pointer-events: none;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }
  `;
  document.head.appendChild(styleEl);
  stylesInjected = true;
}

/**
 * Initializes or rebinds Monaco editor to a collaborative Yjs session with character-level CRDTs.
 */
export function setupMonacoCollab(
  editor: any,
  _monaco: any,
  config: CollabSessionConfig
): () => void {
  injectRemoteCursorStyles();

  // 1. Establish or reuse WebRTC session
  if (!activeDoc || !activeProvider || activeRoom !== config.room) {
    // Tear down any previous room session
    leaveCollabSession();

    activeRoom = config.room;
    activeDoc = new Y.Doc();
    activeProvider = new WebrtcProvider(config.room, activeDoc, {
      signaling: [
        'wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com',
        'wss://y-webrtc-signaling-us.herokuapp.com',
      ],
    });
  }

  const ydoc = activeDoc;
  const provider = activeProvider;

  // 2. Set user awareness (name, color, cursor position)
  provider.awareness.setLocalStateField('user', {
    name: config.name,
    color: config.color,
  });

  const handleAwarenessChange = () => {
    const states = provider.awareness.getStates();
    if (config.onPeersChange) {
      config.onPeersChange(states.size);
    }
  };

  provider.awareness.on('change', handleAwarenessChange);
  handleAwarenessChange();

  // 3. Listen for shared compilation events
  const metaMap = ydoc.getMap<number>('meta');
  const metaObserver = () => {
    const lastCompiledAt = metaMap.get('lastCompiledAt');
    if (lastCompiledAt && config.onRemoteCompile) {
      config.onRemoteCompile(lastCompiledAt);
    }
  };
  metaMap.observe(metaObserver);

  // 4. Bind Monaco editor model via y-monaco for character-level delta CRDTs
  const model = editor.getModel();
  if (!model) {
    return () => {};
  }

  // Clean up any existing binding before creating a new one
  if (activeBinding) {
    try {
      activeBinding.destroy();
    } catch {}
    activeBinding = null;
  }

  const channelName = config.filePath ? `file:${config.filePath}` : 'latex';
  const ytext = ydoc.getText(channelName);

  // Seed remote Yjs doc with initial local text if empty
  if (ytext.toString().length === 0 && model.getValue().length > 0) {
    ytext.insert(0, model.getValue());
  }

  activeBinding = new MonacoBinding(
    ytext,
    model,
    new Set([editor]),
    provider.awareness
  );

  return () => {
    if (activeBinding) {
      try {
        activeBinding.destroy();
      } catch {}
      activeBinding = null;
    }
    metaMap.unobserve(metaObserver);
    provider.awareness.off('change', handleAwarenessChange);
  };
}

/**
 * Broadcasts a compilation event across all connected peers so their PDF viewers refresh in sync.
 */
export function broadcastRemoteCompile(timestamp: number = Date.now()) {
  if (activeDoc) {
    const metaMap = activeDoc.getMap<number>('meta');
    metaMap.set('lastCompiledAt', timestamp);
  }
}

/**
 * Leaves the active room and tears down all WebRTC providers and document memory.
 */
export function leaveCollabSession() {
  if (activeBinding) {
    try {
      activeBinding.destroy();
    } catch {}
    activeBinding = null;
  }
  if (activeProvider) {
    try {
      activeProvider.destroy();
    } catch {}
    activeProvider = null;
  }
  if (activeDoc) {
    try {
      activeDoc.destroy();
    } catch {}
    activeDoc = null;
  }
  activeRoom = null;
}
