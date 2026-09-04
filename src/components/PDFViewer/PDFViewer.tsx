import React, { useState, useEffect } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Moon,
  Sun,
  FileText,
  PanelRightClose,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ImageOff,
  X,
  Search,
  ArrowLeft,
} from 'lucide-react';

export interface CompileErrorItem {
  file: string;
  line: number;
  message: string;
  friendlyExplanation?: string;
  raw?: string;
}

export interface SyncTexTarget {
  page: number;
  x: number;
  y: number;
  line: number;
  file: string;
  timestamp: number;
}

interface PDFViewerProps {
  pdfUrl: string | null;
  lastValidPdfUrl: string | null;
  compileDuration: number | null;
  compileStatus: 'idle' | 'compiling' | 'success' | 'failed';
  compileErrors: CompileErrorItem[];
  onSelectErrorLine?: (line: number) => void;
  onToggleCollapse?: () => void;
  synctexTarget?: SyncTexTarget | null;
  onSyncTexBackward?: (page: number, x: number, y: number, text?: string) => void;
  isSyncingBackward?: boolean;
}

export const PDFViewer: React.FC<PDFViewerProps> = ({
  pdfUrl,
  lastValidPdfUrl,
  compileDuration,
  compileStatus,
  compileErrors,
  onSelectErrorLine,
  onToggleCollapse,
  synctexTarget,
  onSyncTexBackward,
  isSyncingBackward,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeSyncToast, setActiveSyncToast] = useState<SyncTexTarget | null>(null);
  const [jumpSearchText, setJumpSearchText] = useState<string>('');
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);

  // Restore zoom from localStorage or default to 100%
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem('overleaf-copy:pdf-zoom');
    return saved ? parseInt(saved, 10) : 100;
  });
  const [invertColors, setInvertColors] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:pdf-night') === 'true';
  });

  const [pageNavKey, setPageNavKey] = useState<string>('');

  const handleBackwardJump = async (customText?: string, customY: number = 300) => {
    if (!onSyncTexBackward) return;
    let textToSearch = customText?.trim();

    if (!textToSearch) {
      // 1. Check window selection
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0 && sel.length < 200) {
        textToSearch = sel;
      }
    }

    if (!textToSearch && navigator.clipboard && navigator.clipboard.readText) {
      // 2. Check clipboard in case user copied text in PDF
      try {
        const clip = await navigator.clipboard.readText();
        if (clip && clip.trim().length > 0 && clip.trim().length < 200) {
          textToSearch = clip.trim();
        }
      } catch {
        // clipboard access may require active user gesture or permission
      }
    }

    onSyncTexBackward(currentPage, 150, customY, textToSearch);
  };

  useEffect(() => {
    localStorage.setItem('overleaf-copy:pdf-zoom', zoom.toString());
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem('overleaf-copy:pdf-night', invertColors.toString());
  }, [invertColors]);

  // Handle SyncTeX Forward Target
  useEffect(() => {
    if (synctexTarget) {
      setCurrentPage(synctexTarget.page);
      setPageNavKey(`#page=${synctexTarget.page}`);
      setActiveSyncToast(synctexTarget);
      const timer = setTimeout(() => {
        setActiveSyncToast(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [synctexTarget]);

  // Display the active pdfUrl, or fallback to the last valid PDF url if compilation failed
  const activePdf = pdfUrl || lastValidPdfUrl;
  const isShowingStalePdf = !pdfUrl && !!lastValidPdfUrl && compileStatus === 'failed';

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 dark:bg-slate-900 select-none overflow-hidden">
      {/* Top PDF Controls & Status Bar */}
      <div className="h-9 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightSubtle dark:border-surface-darkSubtle px-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 flex-shrink-0">
        {/* Left: Zoom controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
            title="Zoom Out"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono w-10 text-center text-[11px]">{zoom}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
            title="Zoom In"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(100)}
            title="Reset Zoom (100%)"
            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 transition text-[10px]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Compilation Status Badge */}
        <div className="flex items-center space-x-1.5">
          {compileStatus === 'compiling' && (
            <div className="flex items-center space-x-1 text-brand-cyan text-[11px] font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Compiling...</span>
            </div>
          )}
          {compileStatus === 'success' && (
            <div className="flex items-center space-x-1 text-brand-mint text-[11px] font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>
                Compiled {compileDuration !== null ? `${(compileDuration / 1000).toFixed(1)}s` : ''}
              </span>
            </div>
          )}
          {compileStatus === 'failed' && (
            <div className="flex items-center space-x-1 text-rose-400 text-[11px] font-medium">
              <AlertTriangle className="w-3 h-3" />
              <span>Compilation failed</span>
            </div>
          )}
          {isShowingStalePdf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-medium">
              showing previous PDF
            </span>
          )}
        </div>

        {/* Right: SyncTeX Backward, Night filter, download, collapse */}
        <div className="flex items-center space-x-1.5">
          {onSyncTexBackward && activePdf && (
            <div className="flex items-center space-x-1">
              {showSearchInput ? (
                <div className="flex items-center bg-white dark:bg-slate-800 border border-brand-cyan/50 rounded px-1.5 py-0.5 shadow-sm">
                  <Search className="w-3 h-3 text-brand-cyan mr-1 flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Jump to text in code..."
                    value={jumpSearchText}
                    onChange={(e) => setJumpSearchText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleBackwardJump(jumpSearchText);
                      } else if (e.key === 'Escape') {
                        setShowSearchInput(false);
                      }
                    }}
                    autoFocus
                    className="w-36 bg-transparent text-[11px] text-slate-800 dark:text-slate-100 outline-none placeholder-slate-400 font-sans"
                  />
                  <button
                    onClick={() => handleBackwardJump(jumpSearchText)}
                    disabled={isSyncingBackward}
                    title="Jump to LaTeX code containing this text"
                    className="p-0.5 hover:text-brand-cyan transition"
                  >
                    {isSyncingBackward ? (
                      <Loader2 className="w-3 h-3 animate-spin text-brand-cyan" />
                    ) : (
                      <ArrowLeft className="w-3 h-3 text-brand-cyan" />
                    )}
                  </button>
                  <button
                    onClick={() => setShowSearchInput(false)}
                    className="p-0.5 hover:text-slate-500 text-slate-400 transition ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-0.5">
                  <button
                    onClick={() => handleBackwardJump()}
                    disabled={isSyncingBackward}
                    title="Jump to code from selected text or current PDF position (SyncTeX Backward)"
                    className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-brand-cyan/15 hover:bg-brand-cyan/25 text-brand-cyan border border-brand-cyan/30 transition disabled:opacity-50"
                  >
                    {isSyncingBackward ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ArrowLeft className="w-3 h-3" />
                    )}
                    <span className="hidden sm:inline">To Code</span>
                  </button>
                  <button
                    onClick={() => setShowSearchInput(true)}
                    title="Jump by text search in source code"
                    className="p-1 rounded text-slate-400 hover:text-brand-cyan hover:bg-slate-200 dark:hover:bg-slate-800 transition"
                  >
                    <Search className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => setInvertColors((v) => !v)}
            title="Toggle Night Reading Mode"
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition text-[11px] ${
              invertColors
                ? 'bg-brand-indigo text-white'
                : 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500'
            }`}
          >
            {invertColors ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            <span className="hidden sm:inline">Night</span>
          </button>

          {activePdf && (
            <a
              href={activePdf}
              download="document.pdf"
              title="Download Compiled PDF"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-brand-mint transition flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse PDF Viewer"
              className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 hover:text-white transition"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* PDF Viewport & Error Overlay Area */}
      <div className="flex-1 overflow-auto p-4 flex flex-col items-center justify-start relative">
        {/* Error Diagnostics Banner */}
        {compileErrors.length > 0 && (
          <div className="w-full max-w-2xl mb-4 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 text-xs space-y-2 shadow-lg flex-shrink-0 animate-in fade-in duration-150">
            <div className="flex items-center justify-between font-bold text-rose-500">
              <span className="flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Compilation Diagnostics ({compileErrors.length} issues)</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">
                {isShowingStalePdf ? 'Showing last valid PDF below' : 'Fix errors to generate PDF'}
              </span>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {compileErrors.map((err, idx) => {
                const isFigureError =
                  err.message.toLowerCase().includes('figure') ||
                  err.message.includes('image') ||
                  err.friendlyExplanation?.includes('Figure');

                return (
                  <div
                    key={idx}
                    onClick={() => err.line && onSelectErrorLine?.(err.line)}
                    className="p-2.5 rounded-md bg-surface-lightPanel dark:bg-surface-darkPanel border border-rose-500/20 cursor-pointer hover:border-rose-400 hover:shadow transition"
                  >
                    <div className="flex items-center justify-between text-slate-900 dark:text-white font-medium">
                      <div className="flex items-center space-x-1.5">
                        {isFigureError && <ImageOff className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                        <span className="font-mono text-rose-400">
                          {err.line > 0 ? `Line ${err.line}` : 'Compile Error'}
                        </span>
                      </div>
                      {err.line > 0 && (
                        <span className="text-slate-400 text-[10px] hover:text-brand-cyan">
                          Jump to line →
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 mt-1 font-mono text-[11px] whitespace-pre-wrap">
                      {err.message}
                    </p>
                    {err.friendlyExplanation && (
                      <div className="mt-1.5 p-1.5 rounded bg-brand-cyan/10 border border-brand-cyan/20 text-brand-cyan text-[11px] font-sans">
                        💡 {err.friendlyExplanation}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* SyncTeX Floating Notification Banner */}
        {activeSyncToast && (
          <div className="sticky top-2 z-40 mb-3 flex items-center space-x-2.5 px-4 py-2 rounded-full bg-brand-indigo text-white shadow-2xl border border-brand-mint/50 text-xs animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="w-2 h-2 rounded-full bg-brand-mint animate-ping flex-shrink-0" />
            <span className="font-medium">
              SyncTeX Jumped to <strong>Page {activeSyncToast.page}</strong>, Line {activeSyncToast.line} ({activeSyncToast.file})
            </span>
            <button
              onClick={() => setActiveSyncToast(null)}
              className="p-0.5 text-slate-300 hover:text-white transition rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* PDF Iframe with SyncTeX navigation */}
        {activePdf ? (
          <div
            onDoubleClick={(e) => {
              if (onSyncTexBackward) {
                const rect = e.currentTarget.getBoundingClientRect();
                const clickY = e.clientY - rect.top;
                const approxPt = Math.max(50, Math.min(750, Math.round(clickY * 0.9)));
                handleBackwardJump(undefined, approxPt);
              }
            }}
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              filter: invertColors ? 'invert(0.9) hue-rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease-out',
            }}
            className="w-full max-w-3xl shadow-2xl rounded-sm overflow-hidden bg-white relative cursor-pointer"
            title="Double click to jump to LaTeX source code"
          >
            <iframe
              key={`${activePdf.split('&t=')[0]}${pageNavKey}`}
              src={`${activePdf}${pageNavKey || '#toolbar=0&navpanes=0&scrollbar=1'}`}
              title="Compiled PDF Preview"
              className="w-full h-[85vh] border-0 bg-white"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 text-center p-8 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-brand-mint">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">No PDF Generated Yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Click <span className="text-brand-mint font-semibold">Recompile</span> or press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 font-mono text-xs">
                  Ctrl+Enter
                </kbd>{' '}
                to compile your LaTeX code.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
