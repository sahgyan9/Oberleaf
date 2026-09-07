/**
 * Local storage helpers.
 *
 * Keys were originally prefixed `overleaf-copy:`, the repository's working
 * name. They are read and rewritten under `oberleaf:` here, with a one-time
 * migration so existing installs keep their preferences.
 */
const PREFIX = 'oberleaf:';
const LEGACY_PREFIX = 'overleaf-copy:';

export function readSetting(key: string): string | null {
  try {
    const current = localStorage.getItem(PREFIX + key);
    if (current !== null) return current;

    const legacy = localStorage.getItem(LEGACY_PREFIX + key);
    if (legacy !== null) {
      localStorage.setItem(PREFIX + key, legacy);
      localStorage.removeItem(LEGACY_PREFIX + key);
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Quota or a privacy mode that blocks storage: preferences are a
    // convenience, never a correctness requirement.
  }
}

export function removeSetting(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
    localStorage.removeItem(LEGACY_PREFIX + key);
  } catch {
    // Ignore.
  }
}

/**
 * Cached editor content is keyed by project *and* file. The previous single
 * `last-content` key meant opening project B briefly showed project A's
 * document, and seeded an auto-save with it if the fetch failed.
 */
function contentKey(projectId: string, filePath: string): string {
  return `content:${projectId}:${filePath}`;
}

export function readCachedContent(projectId: string, filePath: string): string | null {
  if (!projectId) return null;
  return readSetting(contentKey(projectId, filePath));
}

export function writeCachedContent(projectId: string, filePath: string, content: string): void {
  if (!projectId) return;
  writeSetting(contentKey(projectId, filePath), content);
}

/** The project to open on boot: an invite link's ?project= wins over the last one used. */
export function getInitialProjectId(): string {
  try {
    const queryProject = new URLSearchParams(window.location.search).get('project');
    if (queryProject) return queryProject;
  } catch {
    // Fall through to the stored value.
  }
  return readSetting('active-project-id') || '';
}
