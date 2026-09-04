import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Upload,
} from 'lucide-react';
import { FileEntry } from '../FileTree/FileTree';

interface ImageMetadata {
  name: string;
  relativePath: string;
  size?: number;
  extension?: string;
  width?: number;
  height?: number;
}

interface InsertImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileEntry[];
  projectId: string;
  editorContent: string;
  onInsert: (latexSnippet: string, preambleAddition?: string) => void;
  onUploadFiles?: (files: File[]) => void;
}

export const InsertImageModal: React.FC<InsertImageModalProps> = ({
  isOpen,
  onClose,
  files,
  projectId,
  editorContent,
  onInsert,
  onUploadFiles,
}) => {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [widthValue, setWidthValue] = useState<string>('0.8');
  const [widthUnit, setWidthUnit] = useState<string>('\\textwidth');
  const [caption, setCaption] = useState<string>('Figure caption');
  const [label, setLabel] = useState<string>('fig:example');
  const [placement, setPlacement] = useState<string>('htbp');
  const [imgDimensions, setImgDimensions] = useState<Record<string, { w: number; h: number }>>({});
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Recursively extract all image files from the project tree
  const imageFiles = useMemo(() => {
    const list: ImageMetadata[] = [];
    const traverse = (items: FileEntry[]) => {
      for (const item of items) {
        if (item.type === 'directory' && item.children) {
          traverse(item.children);
        } else if (
          item.type === 'file' &&
          item.extension &&
          ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.pdf'].includes(item.extension.toLowerCase())
        ) {
          list.push({
            name: item.name,
            relativePath: item.relativePath || item.name,
            size: item.size,
            extension: item.extension.toLowerCase(),
          });
        }
      }
    };
    traverse(files);
    return list;
  }, [files]);

  // Auto-select first image when modal opens or files change
  useEffect(() => {
    if (imageFiles.length > 0 && (!selectedPath || !imageFiles.some((f) => f.relativePath === selectedPath))) {
      const first = imageFiles[0];
      setSelectedPath(first.relativePath);
      const cleanBase = first.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      setLabel(`fig:${cleanBase}`);
      setCaption(first.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
    }
  }, [imageFiles, selectedPath]);

  if (!isOpen) return null;

  const hasGraphicx =
    editorContent.includes('\\usepackage{graphicx}') ||
    editorContent.includes('\\usepackage[') && editorContent.includes(']{graphicx}');

  const formatBytes = (bytes?: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSelectImage = (img: ImageMetadata) => {
    setSelectedPath(img.relativePath);
    const cleanBase = img.name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    setLabel(`fig:${cleanBase}`);
    setCaption(img.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
  };

  const handleConfirm = () => {
    const finalPath = selectedPath || 'figures/image.png';
    const finalWidth = widthUnit ? `${widthValue}${widthUnit}` : widthValue;
    const snippet = `\\begin{figure}[${placement}]
  \\centering
  \\includegraphics[width=${finalWidth}]{${finalPath}}
  \\caption{${caption}}
  \\label{${label}}
\\end{figure}
`;

    const preamble = !hasGraphicx ? '\\usepackage{graphicx}\n' : undefined;
    onInsert(snippet, preamble);
    onClose();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onUploadFiles) {
      onUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0 && onUploadFiles) {
      onUploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightSubtle dark:border-surface-darkSubtle w-full max-w-2xl rounded-xl p-5 shadow-2xl space-y-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-shrink-0">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-semibold text-sm">
            <ImageIcon className="w-4 h-4 text-brand-mint" />
            <span>Insert LaTeX Figure</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* graphicx warning banner if missing */}
        {!hasGraphicx && (
          <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-500 text-xs flex-shrink-0">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              <strong>Note:</strong> <code>\usepackage&#123;graphicx&#125;</code> will be added to your document preamble automatically.
            </span>
          </div>
        )}

        {/* Modal Body: Image Selector + Settings */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* 1. Image Selection Grid */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Choose Image Asset ({imageFiles.length} available)
              </label>
              {onUploadFiles && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    multiple
                    accept=".png,.jpg,.jpeg,.svg,.webp,.pdf"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-1 text-xs text-brand-cyan hover:text-brand-mint transition font-medium"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload New</span>
                  </button>
                </>
              )}
            </div>

            {imageFiles.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto p-1">
                {imageFiles.map((img) => {
                  const isSelected = selectedPath === img.relativePath;
                  const previewUrl = `/api/projects/${projectId}/preview-image?path=${encodeURIComponent(
                    img.relativePath
                  )}`;
                  const dims = imgDimensions[img.relativePath];

                  return (
                    <div
                      key={img.relativePath}
                      onClick={() => handleSelectImage(img)}
                      className={`relative flex flex-col p-2 rounded-lg border cursor-pointer transition text-xs ${
                        isSelected
                          ? 'border-brand-mint ring-2 ring-brand-mint/30 bg-brand-mint/5 dark:bg-brand-mint/10'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700 bg-surface-lightSubtle dark:bg-surface-darkSubtle'
                      }`}
                    >
                      {/* Image Thumbnail Preview */}
                      <div className="w-full h-24 rounded bg-slate-100 dark:bg-slate-900 overflow-hidden flex items-center justify-center relative mb-1.5 border border-slate-200/60 dark:border-slate-800">
                        <img
                          src={previewUrl}
                          alt={img.name}
                          onLoad={(e) => {
                            const target = e.currentTarget;
                            setImgDimensions((prev) => ({
                              ...prev,
                              [img.relativePath]: { w: target.naturalWidth, h: target.naturalHeight },
                            }));
                          }}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-brand-mint text-slate-950 flex items-center justify-center shadow-md">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* File Metadata */}
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate" title={img.name}>
                        {img.name}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                        <span>{img.size ? formatBytes(img.size) : img.extension}</span>
                        {dims && <span>{dims.w}×{dims.h}</span>}
                      </div>
                      <span className="text-[9px] text-brand-cyan font-mono truncate mt-0.5" title={img.relativePath}>
                        {img.relativePath}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="p-6 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-center cursor-pointer hover:border-brand-mint transition flex flex-col items-center justify-center space-y-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle"
              >
                <Upload className="w-6 h-6 text-brand-mint" />
                <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                  No images found in project. Click or drag images here to import.
                </span>
                <span className="text-[11px] text-slate-400">Supported: PNG, JPEG, SVG, WEBP, PDF</span>
              </div>
            )}
          </div>

          {/* 2. Figure Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Figure Width */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Figure Width</label>
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  value={widthValue}
                  onChange={(e) => setWidthValue(e.target.value)}
                  className="flex-1 bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none font-mono"
                  placeholder="0.8"
                />
                <select
                  value={widthUnit}
                  onChange={(e) => setWidthUnit(e.target.value)}
                  className="w-32 bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none font-mono"
                >
                  <option value="\textwidth">\textwidth</option>
                  <option value="\columnwidth">\columnwidth</option>
                  <option value="\linewidth">\linewidth</option>
                  <option value="cm">cm</option>
                  <option value="in">in</option>
                  <option value="">(custom)</option>
                </select>
              </div>
            </div>

            {/* Placement */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Placement Specifier</label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none font-mono"
              >
                <option value="htbp">[htbp] — Default (here, top, bottom, page)</option>
                <option value="h!">[h!] — Force approximate position</option>
                <option value="t">[t] — Top of page</option>
                <option value="b">[b] — Bottom of page</option>
                <option value="p">[p] — Dedicated page of floats</option>
                <option value="H">[H] — Strict exact position (float pkg)</option>
              </select>
            </div>

            {/* Caption */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Caption</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none"
                placeholder="Figure caption..."
              />
            </div>

            {/* Label */}
            <div>
              <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">LaTeX Reference Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none font-mono"
                placeholder="fig:experiment"
              />
            </div>
          </div>

          {/* 3. Live LaTeX Code Preview */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
              Generated LaTeX Code
            </label>
            <pre className="p-3 rounded-lg bg-surface-dark border border-slate-800 text-brand-mint text-[11px] font-mono overflow-x-auto whitespace-pre">
{`\\begin{figure}[${placement}]
  \\centering
  \\includegraphics[width=${widthValue}${widthUnit}]{${selectedPath || 'figures/image.png'}}
  \\caption{${caption}}
  \\label{${label}}
\\end{figure}`}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={imageFiles.length === 0 && !selectedPath}
            className="px-4 py-1.5 rounded-md bg-brand-mint text-slate-950 hover:brightness-110 disabled:opacity-50 text-xs font-semibold shadow-md shadow-brand-mint/20 transition"
          >
            Insert Figure
          </button>
        </div>
      </div>
    </div>
  );
};
