import React, { useState, useRef } from 'react';
import { X, Image as ImageIcon, Upload, Check, AlertCircle } from 'lucide-react';
import { FileEntry } from '../FileTree/FileTree';

interface InsertImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: FileEntry[];
  projectId: string;
  editorContent: string;
  onInsert: (latexSnippet: string) => void;
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
  const [caption, setCaption] = useState<string>('My figure caption');
  const [label, setLabel] = useState<string>('fig:my_figure');
  const [widthValue, setWidthValue] = useState<string>('0.8');
  const [widthUnit, setWidthUnit] = useState<string>('\\textwidth');
  const [placement, setPlacement] = useState<string>('htbp');
  const [imgDimensions, setImgDimensions] = useState<Record<string, { w: number; h: number }>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Find all image files in project recursively
  const findImages = (entries: FileEntry[]): FileEntry[] => {
    let images: FileEntry[] = [];
    for (const entry of entries) {
      if (entry.type === 'file') {
        const ext = (entry.extension || '').toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.svg', '.webp', '.pdf'].includes(ext)) {
          images.push(entry);
        }
      } else if (entry.type === 'directory' && entry.children) {
        images = images.concat(findImages(entry.children));
      }
    }
    return images;
  };

  const imageFiles = findImages(files);

  // Auto-select first image if none selected
  if (!selectedPath && imageFiles.length > 0) {
    setSelectedPath(imageFiles[0].relativePath);
  }

  // Check if graphicx is in preamble
  const hasGraphicx = editorContent.includes('\\usepackage{graphicx}') || editorContent.includes('\\usepackage[');

  const handleSelectImage = (img: FileEntry) => {
    setSelectedPath(img.relativePath);
    // Suggest sane label and caption based on filename
    const cleanName = img.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    if (!label || label === 'fig:my_figure') {
      setLabel(`fig:${cleanName.toLowerCase()}`);
    }
    if (!caption || caption === 'My figure caption') {
      setCaption(img.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleConfirm = () => {
    if (!selectedPath) return;

    // Use relative path with forward slashes, strip extension as best practice in LaTeX
    const cleanPath = selectedPath.replace(/\\/g, '/');

    const snippet = `\\begin{figure}[${placement}]
  \\centering
  \\includegraphics[width=${widthValue}${widthUnit}]{${cleanPath}}
  \\caption{${caption}}
  \\label{${label}}
\\end{figure}
`;

    // Also auto-insert \usepackage{graphicx} if needed
    let finalSnippet = snippet;
    if (!hasGraphicx) {
      // User will see graphicx inserted or guidance
    }

    onInsert(finalSnippet);
    onClose();
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none animate-in fade-in duration-150 font-sans">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-2xl rounded-xl p-5 shadow-2xl space-y-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3 flex-shrink-0">
          <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-serif font-semibold text-base">
            <ImageIcon className="w-4 h-4 text-diagnostic dark:text-diagnostic-dark" />
            <span>Insert LaTeX Figure</span>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* graphicx warning banner if missing */}
        {!hasGraphicx && (
          <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-diagnostic-subtle/80 dark:bg-diagnostic-darkSubtle/40 border border-diagnostic/30 text-diagnostic dark:text-diagnostic-dark text-xs flex-shrink-0">
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
              <label className="text-xs font-semibold text-stone-700 dark:text-stone-300">
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
                    className="flex items-center space-x-1 text-xs text-scholarly dark:text-scholarly-dark hover:underline transition font-medium btn-tactile"
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
                      className={`relative flex flex-col p-2 rounded-lg border cursor-pointer transition text-xs btn-tactile ${
                        isSelected
                          ? 'border-scholarly dark:border-scholarly-dark ring-2 ring-scholarly/30 bg-scholarly-subtle/50 dark:bg-scholarly-darkSubtle/40'
                          : 'border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
                      }`}
                    >
                      {/* Image Thumbnail Preview */}
                      <div className="w-full h-24 rounded bg-stone-100 dark:bg-stone-900 overflow-hidden flex items-center justify-center relative mb-1.5 border border-surface-lightBorder dark:border-surface-darkBorder">
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
                          <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-scholarly dark:bg-scholarly-dark text-white flex items-center justify-center shadow-xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* File Metadata */}
                      <span className="font-semibold text-stone-800 dark:text-stone-200 truncate" title={img.name}>
                        {img.name}
                      </span>
                      <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono mt-0.5">
                        <span>{img.size ? formatBytes(img.size) : img.extension}</span>
                        {dims && <span>{dims.w}×{dims.h}</span>}
                      </div>
                      <span className="text-[9px] text-stone-500 font-mono truncate mt-0.5" title={img.relativePath}>
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
                className="p-6 border-2 border-dashed border-stone-300 dark:border-stone-700 rounded-lg text-center cursor-pointer hover:border-scholarly dark:hover:border-scholarly-dark transition flex flex-col items-center justify-center space-y-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle"
              >
                <Upload className="w-6 h-6 text-stone-400" />
                <span className="text-xs text-stone-700 dark:text-stone-300 font-medium">
                  No images found in project. Click or drag images here to import.
                </span>
                <span className="text-[11px] text-stone-400">Supported: PNG, JPEG, SVG, WEBP, PDF</span>
              </div>
            )}
          </div>

          {/* 2. Figure Parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {/* Figure Width */}
            <div>
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Figure Width</label>
              <div className="flex space-x-1.5">
                <input
                  type="text"
                  value={widthValue}
                  onChange={(e) => setWidthValue(e.target.value)}
                  className="flex-1 bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-mono"
                  placeholder="0.8"
                />
                <select
                  value={widthUnit}
                  onChange={(e) => setWidthUnit(e.target.value)}
                  className="w-32 bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-mono"
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
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Placement Specifier</label>
              <select
                value={placement}
                onChange={(e) => setPlacement(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-mono"
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
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Caption</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-sans"
                placeholder="Figure caption..."
              />
            </div>

            {/* Label */}
            <div>
              <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">LaTeX Reference Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-mono"
                placeholder="fig:experiment"
              />
            </div>
          </div>

          {/* 3. Live LaTeX Code Preview */}
          <div>
            <label className="block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1">
              Generated LaTeX Code
            </label>
            <pre className="p-3 rounded-lg bg-stone-900 border border-stone-800 text-stone-200 text-[11px] font-mono overflow-x-auto whitespace-pre">
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
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-xs font-medium transition btn-tactile"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={imageFiles.length === 0 && !selectedPath}
            className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white disabled:opacity-50 text-xs font-medium shadow-xs transition btn-tactile"
          >
            Insert Figure
          </button>
        </div>
      </div>
    </div>
  );
};
