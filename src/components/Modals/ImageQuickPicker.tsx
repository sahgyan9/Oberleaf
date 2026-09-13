import React, { useState, useEffect, useRef, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Image as ImageIcon, Upload, FileImage, Loader2 } from 'lucide-react';
import { FileEntry } from '../FileTree/FileTree';
import {
  findProjectImages,
  formatBytes,
  hasThumbnail,
  ImageAtCursor,
  isImageFile,
  previewImageUrl,
} from '../../utils/imageHelper';

export type ImagePickerKey = 'up' | 'down' | 'accept';

export interface ImageQuickPickerHandle {
  /** Returns false when the key had nothing to act on, so the editor can handle it normally. */
  handleKey: (key: ImagePickerKey) => boolean;
}

interface ImageQuickPickerProps {
  projectId: string;
  files: FileEntry[];
  imageContext: ImageAtCursor | null;
  uploadingName: string | null;
  onSelectImage: (relativePath: string) => void;
  onRequestUpload: () => void;
  onDropFiles: (files: File[]) => void;
  onDismiss: () => void;
}

const CARD_WIDTH = 480;

function rankImages(images: FileEntry[], query: string): FileEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return images;
  const score = (img: FileEntry): number => {
    const name = img.name.toLowerCase();
    const rel = img.relativePath.toLowerCase();
    if (rel === q || name === q || rel.replace(/\.[^/.]+$/, '') === q) return 0;
    if (name.startsWith(q) || rel.startsWith(q)) return 1;
    if (name.includes(q)) return 2;
    if (rel.includes(q)) return 3;
    return -1;
  };
  return images
    .map((img, index) => ({ img, index, s: score(img) }))
    .filter((r) => r.s >= 0)
    .sort((a, b) => a.s - b.s || a.index - b.index)
    .map((r) => r.img);
}

const Thumbnail: React.FC<{ projectId: string; image: FileEntry; className: string; onSize?: (w: number, h: number) => void }> = ({
  projectId,
  image,
  className,
  onSize,
}) => {
  const [failed, setFailed] = useState(false);
  if (failed || !hasThumbnail(image.name)) {
    const ext = (image.name.split('.').pop() || '').toUpperCase();
    return (
      <div className={`${className} flex flex-col items-center justify-center text-stone-400`}>
        <FileImage className="w-5 h-5" />
        <span className="text-[9px] font-mono mt-0.5">{ext}</span>
      </div>
    );
  }
  return (
    <div className={`${className} flex items-center justify-center overflow-hidden`}>
      <img
        src={previewImageUrl(projectId, image.relativePath)}
        alt=""
        draggable={false}
        onLoad={(e) => onSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
        onError={() => setFailed(true)}
        className="max-w-full max-h-full object-contain pointer-events-none"
      />
    </div>
  );
};

export const ImageQuickPicker = forwardRef<ImageQuickPickerHandle, ImageQuickPickerProps>(
  ({ projectId, files, imageContext, uploadingName, onSelectImage, onRequestUpload, onDropFiles, onDismiss }, ref) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const [dims, setDims] = useState<Record<string, { w: number; h: number }>>({});
    const [isDragOver, setIsDragOver] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    const allImages = useMemo(() => findProjectImages(files), [files]);
    const query = imageContext?.currentPath ?? '';
    const matches = useMemo(() => rankImages(allImages, query), [allImages, query]);
    // An unmatched query (e.g. a stale "figure" placeholder) should not leave the user at a dead end.
    const noMatch = query.trim() !== '' && matches.length === 0;
    const shown = noMatch ? allImages : matches;

    useEffect(() => {
      setActiveIndex(0);
    }, [query, allImages.length]);

    useEffect(() => {
      listRef.current
        ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex]);

    useImperativeHandle(
      ref,
      () => ({
        handleKey: (key) => {
          if (shown.length === 0) return false;
          if (key === 'down') setActiveIndex((i) => (i + 1) % shown.length);
          else if (key === 'up') setActiveIndex((i) => (i - 1 + shown.length) % shown.length);
          else onSelectImage(shown[Math.min(activeIndex, shown.length - 1)].relativePath);
          return true;
        },
      }),
      [shown, activeIndex, onSelectImage]
    );

    if (!imageContext?.position) return null;

    const active = shown[Math.min(activeIndex, shown.length - 1)];
    const top = Math.min(Math.max(imageContext.position.top, 8), window.innerHeight - 330);
    const left = Math.min(Math.max(imageContext.position.left, 8), window.innerWidth - CARD_WIDTH - 8);

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const dropped = Array.from(e.dataTransfer.files).filter(isImageFile);
      if (dropped.length > 0) onDropFiles(dropped);
    };

    return (
      <div
        role="listbox"
        aria-label="Project images"
        style={{ top, left, width: CARD_WIDTH }}
        // Keep keyboard focus in the editor: the braces are the search field.
        onMouseDown={(e) => e.preventDefault()}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          e.stopPropagation();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
        }}
        onDrop={handleDrop}
        className={`fixed z-[100] max-w-[95vw] flex flex-col rounded-lg border bg-surface-lightPanel dark:bg-surface-darkPanel shadow-xl font-sans select-none ${
          isDragOver
            ? 'border-scholarly dark:border-scholarly-dark ring-2 ring-scholarly/30'
            : 'border-surface-lightBorder dark:border-surface-darkBorder'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-surface-lightBorder dark:border-surface-darkBorder">
          <div className="flex items-center gap-2 min-w-0 text-xs">
            <ImageIcon className="w-3.5 h-3.5 text-stone-500 flex-shrink-0" />
            <span className="font-semibold text-stone-800 dark:text-stone-100">Choose image</span>
            {query.trim() && !noMatch && (
              <span className="text-stone-400 truncate">
                matching <span className="font-mono text-stone-600 dark:text-stone-300">{query.trim()}</span>
              </span>
            )}
          </div>
          {uploadingName ? (
            <span className="flex items-center gap-1.5 text-[11px] text-stone-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              Uploading {uploadingName}
            </span>
          ) : (
            <button
              onClick={onRequestUpload}
              className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
            >
              <Upload className="w-3 h-3" />
              Upload
            </button>
          )}
        </div>

        {allImages.length === 0 ? (
          <button
            onClick={onRequestUpload}
            className="m-3 p-6 border border-dashed border-stone-300 dark:border-stone-700 rounded-md text-center hover:border-scholarly dark:hover:border-scholarly-dark transition flex flex-col items-center gap-1.5"
          >
            <Upload className="w-5 h-5 text-stone-400" />
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300">No images in this project yet</span>
            <span className="text-[11px] text-stone-400">
              Click to upload, drop a file here, or paste a screenshot into the editor
            </span>
          </button>
        ) : (
          <>
            {noMatch && (
              <div className="px-3 pt-2 text-[11px] text-stone-500">
                No image matches <span className="font-mono">{query.trim()}</span>. Showing all images.
              </div>
            )}
            <div className="flex min-h-0">
              {/* List */}
              <div ref={listRef} className="w-[55%] max-h-60 overflow-y-auto p-1.5 border-r border-surface-lightBorder dark:border-surface-darkBorder">
                {shown.map((img, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <div
                      key={img.relativePath}
                      data-index={index}
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => onSelectImage(img.relativePath)}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded cursor-pointer ${
                        isActive
                          ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-stone-900 dark:text-stone-50'
                          : 'text-stone-700 dark:text-stone-300'
                      }`}
                    >
                      <Thumbnail
                        projectId={projectId}
                        image={img}
                        className="w-9 h-9 flex-shrink-0 rounded border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-stone-900"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{img.name}</div>
                        <div className="text-[10px] font-mono text-stone-400 truncate">{img.relativePath}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Preview of the highlighted image */}
              <div className="w-[45%] p-2.5 flex flex-col gap-2">
                {active && (
                  <>
                    <Thumbnail
                      key={active.relativePath}
                      projectId={projectId}
                      image={active}
                      onSize={(w, h) => setDims((prev) => ({ ...prev, [active.relativePath]: { w, h } }))}
                      className="h-36 rounded border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-stone-900"
                    />
                    <div className="min-w-0 text-[11px] leading-snug">
                      <div className="font-medium text-stone-800 dark:text-stone-100 truncate" title={active.name}>
                        {active.name}
                      </div>
                      <div className="text-stone-400 font-mono">
                        {[dims[active.relativePath] && `${dims[active.relativePath].w} x ${dims[active.relativePath].h}`, formatBytes(active.size)]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-surface-lightBorder dark:border-surface-darkBorder text-[10px] text-stone-400 rounded-b-lg bg-surface-lightSubtle/60 dark:bg-surface-darkSubtle/60">
          <span className="flex items-center gap-2">
            <span><Kbd>Up</Kbd> <Kbd>Down</Kbd> select</span>
            <span><Kbd>Enter</Kbd> insert</span>
            <button onClick={onDismiss} className="hover:text-stone-600 dark:hover:text-stone-200">
              <Kbd>Esc</Kbd> close
            </button>
          </span>
          <span>Type in the braces to filter</span>
        </div>
      </div>
    );
  }
);

ImageQuickPicker.displayName = 'ImageQuickPicker';

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="px-1 py-px rounded border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel font-sans text-stone-500">
    {children}
  </kbd>
);
