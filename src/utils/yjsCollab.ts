import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

export interface CollabSessionConfig {
  room: string;
  name: string;
  color: string;
  onPeersChange?: (count: number) => void;
}

export function setupMonacoCollab(
  editor: any,
  _monaco: any,
  config: CollabSessionConfig
): () => void {
  const ydoc = new Y.Doc();
  const provider = new WebrtcProvider(config.room, ydoc, {
    signaling: [
      'wss://signaling.yjs.dev',
      'wss://y-webrtc-signaling-eu.herokuapp.com',
      'wss://y-webrtc-signaling-us.herokuapp.com',
    ],
  });

  const ytext = ydoc.getText('latex');
  const model = editor.getModel();

  if (!model) {
    provider.destroy();
    ydoc.destroy();
    return () => {};
  }

  // Seed remote Yjs doc with initial local text if empty
  if (ytext.toString().length === 0 && model.getValue().length > 0) {
    ytext.insert(0, model.getValue());
  } else if (ytext.toString().length > 0 && model.getValue() !== ytext.toString()) {
    model.setValue(ytext.toString());
  }

  // Awareness (name, color, cursor position)
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

  let isApplyingRemoteChange = false;

  // Remote -> Local
  const ytextObserver = (event: Y.YTextEvent) => {
    if (event.transaction.local) return;
    isApplyingRemoteChange = true;
    try {
      const currentRemote = ytext.toString();
      if (model.getValue() !== currentRemote) {
        model.setValue(currentRemote);
      }
    } finally {
      isApplyingRemoteChange = false;
    }
  };
  ytext.observe(ytextObserver);

  // Local -> Remote
  const monacoChangeDisposable = model.onDidChangeContent(() => {
    if (isApplyingRemoteChange) return;
    const currentVal = model.getValue();
    if (ytext.toString() !== currentVal) {
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        ytext.insert(0, currentVal);
      });
    }
  });

  return () => {
    monacoChangeDisposable.dispose();
    ytext.unobserve(ytextObserver);
    provider.awareness.off('change', handleAwarenessChange);
    provider.destroy();
    ydoc.destroy();
  };
}
