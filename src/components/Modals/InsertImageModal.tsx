import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, Image as ImageIcon, Upload, Check, Info, FileImage, Loader2 } from 'lucide-react';
import { FileEntry } from '../FileTree/FileTree';
import {
  figureLabelFromPath,
  findProjectImages,
  formatBytes,
  hasThumbnail,
  isImageFile,
  previewImageUrl,
} from '../../utils/imageHelper';
import type { FigureOptions } from '../../utils/figureInsertion';

interface InsertImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileEntry[];
  projectId: string;
  /** The open file is a root document that does not load graphicx yet. */
  willAddGraphicx: boolean;
  /** Preselect this image (e.g. the one clicked in the file tree). */
  initialPath?: string;
  onInsertFigure: (relativePath: string, options: FigureOptions) => void;
  onUploadImages: (files: File[]) => Promise<string[]>;
}

const inputClass =
  'bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md px-2 py-1.5 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none';

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
  isOpen,
  onClose,
  files,
  projectId,
  willAddGraphicx,
  initialPath,
  onInsertFigure,
  onUploadImages,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [caption, setCaption] = useState<string>('');
  const [label, setLabel] = useState<string>('');
  const [labelEdited, setLabelEdited] = useState(false);
  const [widthValue, setWidthValue] = useState<string>('0.8');
  const [widthUnit, setWidthUnit] = useState<string>('\\linewidth');
  const [placement, setPlacement] = useState<string>('htbp');
  const [imgDimensions, setImgDimensions] = useState<Record<string, { w: number; h: number }>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageFiles = useMemo(() => findProjectImages(files), [files]);

  const selectImage = (path: string) => {
    setSelectedPath(path);
    if (!labelEdited) setLabel(figureLabelFromPath(path));
  };

  // Every open starts clean; stale captions from the last figure are a trap.
  useEffect(() => {
    if (!isOpen) return;
    const first = initialPath || imageFiles[0]?.relativePath || '';
    setSelectedPath(first);
    setLabel(first ? figureLabelFromPath(first) : '');
    setLabelEdited(false);
    setCaption('');
    setUploadError(null);
    // imageFiles intentionally omitted: a file-list refresh must not reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialPath]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const width = `${widthValue}${widthUnit}`;

  const insert = (path = selectedPath) => {
    if (!path) return;
    onInsertFigure(path, { width, placement, caption: caption.trim(), label: label.trim() || figureLabelFromPath(path) });
    onClose();
  };

  const upload = async (list: File[]) => {
    const images = list.filter(isImageFile);
    if (images.length === 0) {
      setUploadError('Only image files (PNG, JPG, SVG, WEBP, PDF, EPS) can be used as figures.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const paths = await onUploadImages(images);
      if (paths.length > 0) selectImage(paths[0]);
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 select-none font-sans">
      <div
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          upload(Array.from(e.dataTransfer.files));
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
            e.preventDefault();
            insert();
          }
        }}
        className={`bg-surface-lightPanel dark:bg-surface-darkPanel border w-full max-w-2xl rounded-lg p-5 shadow-xl space-y-4 flex flex-col max-h-[90vh] ${
          isDragOver ? 'border-scholarly dark:border-scholarly-dark ring-2 ring-scholarly/30' : 'border-surface-lightBorder dark:border-surface-darkBorder'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3 flex-shrink-0">
          <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-semibold text-sm">
            <ImageIcon className="w-4 h-4 text-stone-500" />
            <span>Insert Figure</span>
          </div>
          <button onClick={onClose} title="Close (Esc)" className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* 1. Image selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                Image <span className="font-normal text-stone-400">({imageFiles.length} in project, double-click to insert)</span>
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files) upload(Array.from(e.target.files));
                  e.target.value = '';
                }}
                className="hidden"
                multiple
                accept=".png,.jpg,.jpeg,.svg,.webp,.pdf,.eps"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center space-x-1 text-xs text-scholarly dark:text-scholarly-dark hover:underline font-medium disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                <span>{uploading ? 'Uploading' : 'Upload'}</span>
              </button>
            </div>

            {uploadError && <div className="mb-2 text-xs text-red-600 dark:text-red-400">{uploadError}</div>}

            {imageFiles.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-0.5">
                {imageFiles.map((img) => {
                  const isSelected = selectedPath === img.relativePath;
                  const dims = imgDimensions[img.relativePath];
                  return (
                    <div
                      key={img.relativePath}
                      onClick={() => selectImage(img.relativePath)}
                      onDoubleClick={() => insert(img.relativePath)}
                      className={`relative flex flex-col p-1.5 rounded-md border cursor-pointer text-xs ${
                        isSelected
                          ? 'border-scholarly dark:border-scholarly-dark ring-2 ring-scholarly/30 bg-scholarly-subtle/50 dark:bg-scholarly-darkSubtle/40'
                          : 'border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
                      }`}
                    >
                      <div className="w-full h-24 rounded bg-white dark:bg-stone-900 overflow-hidden flex items-center justify-center relative mb-1 border border-surface-lightBorder dark:border-surface-darkBorder">
                        {hasThumbnail(img.name) ? (
                          <img
                            src={previewImageUrl(projectId, img.relativePath)}
                            alt=""
                            draggable={false}
                            onLoad={(e) => {
                              const target = e.currentTarget;
                              setImgDimensions((prev) => ({
                                ...prev,
                                [img.relativePath]: { w: target.naturalWidth, h: target.naturalHeight },
                              }));
                            }}
                            className="max-w-full max-h-full object-contain"
                          />
                        ) : (
                          <div className="flex flex-col items-center text-stone-400">
                            <FileImage className="w-6 h-6" />
                            <span className="text-[10px] font-mono">{(img.name.split('.').pop() || '').toUpperCase()}</span>
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-scholarly dark:bg-scholarly-dark text-white flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 stroke-[3]" />
                          </div>
                        )}
                      </div>
                      <span className="font-medium text-stone-800 dark:text-stone-200 truncate" title={img.name}>
                        {img.name}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono">
                        <span className="truncate" title={img.relativePath}>{img.relativePath}</span>
                        <span className="flex-shrink-0 ml-1">{dims ? `${dims.w}x${dims.h}` : formatBytes(img.size)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-6 border border-dashed border-stone-300 dark:border-stone-700 rounded-md text-center hover:border-scholarly dark:hover:border-scholarly-dark flex flex-col items-center space-y-1.5 bg-surface-lightSubtle dark:bg-surface-darkSubtle"
              >
                <Upload className="w-5 h-5 text-stone-400" />
                <span className="text-xs text-stone-700 dark:text-stone-300 font-medium">No images in this project yet</span>
                <span className="text-[11px] text-stone-400">Click to upload, or drop files anywhere in this dialog</span>
              </button>
            )}
          </div>

          {/* 2. Figure parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Caption</label>
              <input
                type="text"
                value={caption}
                autoFocus
                onChange={(e) => setCaption(e.target.value)}
                className={`${inputClass} w-full font-sans`}
                placeholder="Optional. Leave empty to write it in the editor."
              />
            </div>

            <div>
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setLabelEdited(true);
                }}
                className={`${inputClass} w-full font-mono`}
                placeholder="fig:setup"
              />
            </div>

            <div>
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Width</label>
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  value={widthValue}
                  onChange={(e) => setWidthValue(e.target.value)}
                  className={`${inputClass} flex-1 min-w-0 font-mono`}
                  placeholder="0.8"
                />
                <select value={widthUnit} onChange={(e) => setWidthUnit(e.target.value)} className={`${inputClass} w-32 flex-shrink-0 font-mono`}>
                  <option value="\linewidth">\linewidth</option>
                  <option value="\textwidth">\textwidth</option>
                  <option value="\columnwidth">\columnwidth</option>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Placement</label>
              <select value={placement} onChange={(e) => setPlacement(e.target.value)} className={`${inputClass} w-full font-mono`}>
                <option value="htbp">[htbp] Let LaTeX choose (recommended)</option>
                <option value="h!">[h!] Here, if at all possible</option>
                <option value="t">[t] Top of a page</option>
                <option value="b">[b] Bottom of a page</option>
                <option value="p">[p] Separate page of figures</option>
                <option value="H">[H] Exactly here (needs \usepackage&#123;float&#125;)</option>
              </select>
            </div>
          </div>

          {willAddGraphicx && (
            <div className="flex items-start gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <Info className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>
                This document does not load <code className="font-mono">graphicx</code>. <code className="font-mono">\usepackage&#123;graphicx&#125;</code> will be added after <code className="font-mono">\documentclass</code>.
              </span>
            </div>
          )}

          {/* 3. Generated LaTeX */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 mb-1">Generated LaTeX</label>
            <pre className="p-3 rounded-md bg-surface-lightSubtle dark:bg-stone-900 border border-surface-lightBorder dark:border-stone-800 text-stone-700 dark:text-stone-200 text-[11px] font-mono overflow-x-auto whitespace-pre select-text">
{`\\begin{figure}[${placement}]
  \\centering
  \\includegraphics[width=${width}]{${selectedPath || 'figures/image.png'}}
  \\caption{${caption}}
  \\label{${label || (selectedPath ? figureLabelFromPath(selectedPath) : 'fig:')}}
\\end{figure}`}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-xs font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => insert()}
            disabled={!selectedPath}
            className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white disabled:opacity-50 text-xs font-medium"
          >
            Insert Figure
          </button>
        </div>
      </div>
    </div>
  );
};
