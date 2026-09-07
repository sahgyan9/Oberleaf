import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import 'pdfjs-dist/web/pdf_viewer.css';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
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
  Check,
  Undo2,
  Wrench,
  Copy,
  Info,
} from 'lucide-react';

import { DetectedMissingPackage } from '../../utils/latexPackages';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

// Converts PDF points (1/72in) to CSS pixels at 100% zoom, matching typical
// on-screen "actual size" rendering (96 CSS px per inch).
const CSS_UNITS = 96 / 72;

export interface SuggestedFix {
  type: 'add_preamble' | 'install_package' | 'wrap_math_mode';
  packageName?: string;
  codeSnippet: string;
  label: string;
  description: string;
  line?: number;
  targetEnvironment?: string;
}

export interface CompileErrorItem {
  file: string;
  line: number;
  message: string;
  friendlyExplanation?: string;
  suggestedFix?: SuggestedFix;
  isCascading?: boolean;
  cascadingFromLine?: number;
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

export interface PDFViewerHandle {
  getVisibleSyncTarget: () => { page: number; x: number; y: number; text?: string } | null;
  toggleFitWidth: () => void;
}

interface PageDims {
  width: number;
  height: number;
}

interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
  onSyncTexHandled?: () => void;
  onSyncTexBackward?: (page: number, x: number, y: number, text?: string) => void;
  isSyncingBackward?: boolean;
  downloadFileName?: string;
  onApplyFix?: (fix: SuggestedFix) => void;
  onUndoFix?: () => void;
  canUndoFix?: boolean;
  detectedMissingPackages?: DetectedMissingPackage[];
  onApplyBatchFix?: (pkgs: DetectedMissingPackage[]) => void;
}

export const PDFViewer = React.forwardRef<PDFViewerHandle, PDFViewerProps>(({
  pdfUrl,
  lastValidPdfUrl,
  compileDuration,
  compileStatus,
  compileErrors,
  onSelectErrorLine,
  onToggleCollapse,
  synctexTarget,
  onSyncTexHandled,
  onSyncTexBackward,
  isSyncingBackward,
  downloadFileName,
  onApplyFix,
  onUndoFix,
  canUndoFix,
  detectedMissingPackages,
  onApplyBatchFix,
}, ref) => {
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeSyncToast, setActiveSyncToast] = useState<SyncTexTarget | null>(null);
  const [jumpSearchText, setJumpSearchText] = useState<string>('');
  const [showSearchInput, setShowSearchInput] = useState<boolean>(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageDims, setPageDims] = useState<PageDims[]>([]);

  // Restore zoom from localStorage or default to 80%
  const [zoom, setZoom] = useState<number>(() => {
    const saved = localStorage.getItem('overleaf-copy:pdf-zoom');
    return saved ? parseInt(saved, 10) : 80;
  });
  const [isFitWidth, setIsFitWidth] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:pdf-fit-width') === 'true';
  });
  const [invertColors, setInvertColors] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:pdf-night') === 'true';
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pageCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const pageTextLayerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pdfDocRef = useRef<any>(null);
  const restoreScrollTopRef = useRef<number | null>(null);
  // Remembers where the user actually double-clicked (page + PDF-point
  // coordinates), since it is the only reliable position we have once a
  // selection isn't available -- unlike a plugin-rendered iframe, this is
  // real DOM we control, so the coordinates are always accurate to the
  // clicked spot instead of a constant fallback.
  const lastClickRef = useRef<{ page: number; x: number; y: number } | null>(null);
  // Raw per-page text-content items from pdf.js, kept independent of the DOM
  // text layer. LaTeX output often splits a single visual word into several
  // adjacent glyph runs (kerning pairs), which become separate <span>s in the
  // text layer -- native double-click "select word" only selects within one
  // such span, so we reconstruct the actual word ourselves from this data
  // instead of trusting window.getSelection() after a double-click.
  const pageTextItemsRef = useRef<PdfTextItem[][]>([]);

  const scale = (zoom / 100) * CSS_UNITS;

  const viewportAnchorRef = useRef<{ page: number; yPt: number; offsetFromTop: number } | null>(null);
  const isRestoringScrollRef = useRef<boolean>(false);
  const prevScaleRef = useRef<number>(scale);
  const lastHandledSyncTargetRef = useRef<number | null>(null);

  const updateViewportAnchor = useCallback(() => {
    const container = containerRef.current;
    if (!container || pageDims.length === 0 || scale <= 0) return;

    // Anchor at user focus zone (~30% from container top)
    const anchorScreenOffset = Math.min(220, container.clientHeight * 0.3);
    const targetDocY = container.scrollTop + anchorScreenOffset;

    let targetPageIdx = 0;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (el && el.offsetTop <= targetDocY) {
        targetPageIdx = i;
      }
    }

    const pageEl = pageRefs.current[targetPageIdx];
    const dims = pageDims[targetPageIdx];
    if (pageEl && dims) {
      const offsetInPagePx = Math.max(0, targetDocY - pageEl.offsetTop);
      const yPt = dims.height - (offsetInPagePx / scale);
      viewportAnchorRef.current = {
        page: targetPageIdx + 1,
        yPt,
        offsetFromTop: anchorScreenOffset,
      };
    }
  }, [pageDims, scale]);

  const computeFitWidthZoom = useCallback(() => {
    if (!containerRef.current || pageDims.length === 0) return 80;
    const firstPageWidth = pageDims[0]?.width || 595.28;
    const containerWidth = containerRef.current.clientWidth;
    // Account for container padding (p-4 = 32px) + breathing room (16px)
    const availableWidth = Math.max(200, containerWidth - 48);
    const targetScale = availableWidth / firstPageWidth;
    const targetZoom = Math.round((targetScale / CSS_UNITS) * 100);
    return Math.max(50, Math.min(200, targetZoom));
  }, [pageDims]);

  const handleToggleFitWidth = useCallback(() => {
    updateViewportAnchor();
    setIsFitWidth((prev) => {
      const next = !prev;
      localStorage.setItem('overleaf-copy:pdf-fit-width', next.toString());
      if (next) {
        const fitZoom = computeFitWidthZoom();
        setZoom(fitZoom);
      }
      return next;
    });
  }, [updateViewportAnchor, computeFitWidthZoom]);

  useEffect(() => {
    if (!isFitWidth) return;
    const fitZoom = computeFitWidthZoom();
    setZoom(fitZoom);
  }, [isFitWidth, computeFitWidthZoom]);

  useEffect(() => {
    if (!isFitWidth || !containerRef.current) return;
    const el = containerRef.current;
    let resizeTimer: any = null;

    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      updateViewportAnchor();
      resizeTimer = setTimeout(() => {
        const fitZoom = computeFitWidthZoom();
        setZoom(fitZoom);
      }, 50);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      clearTimeout(resizeTimer);
    };
  }, [isFitWidth, computeFitWidthZoom, updateViewportAnchor]);

  useImperativeHandle(
    ref,
    () => ({
      getVisibleSyncTarget: () => {
        const container = containerRef.current;
        if (!container || pageDims.length === 0 || scale <= 0) return null;

        updateViewportAnchor();

        const targetViewportY = container.scrollTop + Math.min(220, container.clientHeight * 0.3);

        let targetPage = 1;
        let targetPageEl: HTMLElement | null = null;
        for (let i = 0; i < pageRefs.current.length; i++) {
          const el = pageRefs.current[i];
          if (el && el.offsetTop <= targetViewportY) {
            targetPage = i + 1;
            targetPageEl = el;
          }
        }

        const dims = pageDims[targetPage - 1];
        if (!dims) return null;

        const pageTop = targetPageEl?.offsetTop ?? 0;
        const offsetPx = Math.max(0, targetViewportY - pageTop);
        const yPt = dims.height - (offsetPx / scale);
        const xPt = dims.width * 0.3;

        let bestText = '';
        const items = pageTextItemsRef.current[targetPage - 1] || [];
        const candidateItems = items.filter(
          (it) => Math.abs(it.y - yPt) < 40 && it.str && it.str.trim().length > 1
        );

        if (candidateItems.length > 0) {
          candidateItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 6) return b.y - a.y;
            return a.x - b.x;
          });

          const headingCandidate = candidateItems.find(
            (it) => it.height >= 11 || (it.str.trim().length >= 4 && !it.str.trim().startsWith('%'))
          );
          bestText = headingCandidate ? headingCandidate.str.trim() : candidateItems[0].str.trim();
        }

        return {
          page: targetPage,
          x: Math.round(xPt),
          y: Math.round(yPt),
          text: bestText || undefined,
        };
      },
      toggleFitWidth: handleToggleFitWidth,
    }),
    [pageDims, scale, updateViewportAnchor, handleToggleFitWidth]
  );

  const getWordAtPoint = (pageIndex: number, xPt: number, yPt: number): string | null => {
    const items = pageTextItemsRef.current[pageIndex];
    if (!items || items.length === 0) return null;

    let hitIdx = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (
        xPt >= it.x - 1 &&
        xPt <= it.x + it.width + 1 &&
        yPt >= it.y - it.height * 0.35 &&
        yPt <= it.y + it.height * 1.15
      ) {
        hitIdx = i;
        break;
      }
    }
    if (hitIdx === -1) return null;

    const clicked = items[hitIdx];
    // Reconstruct the visual line (items sharing the clicked item's baseline)
    // in reading order, since pdf.js already inserts real space characters
    // between items when the underlying content stream has a gap, but not
    // between glyph runs that are really one word.
    const lineEntries = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => Math.abs(it.y - clicked.y) < Math.max(clicked.height, it.height) * 0.4)
      .sort((a, b) => a.it.x - b.it.x);

    let lineText = '';
    let clickCharStart = -1;
    let clickCharEnd = -1;
    for (const { it, idx } of lineEntries) {
      if (idx === hitIdx) clickCharStart = lineText.length;
      lineText += it.str;
      if (idx === hitIdx) clickCharEnd = lineText.length;
    }
    if (clickCharStart === -1) return null;

    const relX = Math.max(0, Math.min(1, (xPt - clicked.x) / (clicked.width || 1)));
    const withinItemOffset = Math.round(relX * (clickCharEnd - clickCharStart));
    const clickIndex = Math.min(lineText.length - 1, Math.max(0, clickCharStart + withinItemOffset));

    const isWordChar = (ch: string | undefined) => !!ch && /[A-Za-z0-9]/.test(ch);
    if (!isWordChar(lineText[clickIndex])) return null;

    let start = clickIndex;
    let end = clickIndex;
    while (start > 0 && isWordChar(lineText[start - 1])) start--;
    while (end < lineText.length - 1 && isWordChar(lineText[end + 1])) end++;

    const word = lineText.slice(start, end + 1).trim();
    return word.length > 1 ? word : null;
  };

  const handleBackwardJump = (customText?: string) => {
    if (!onSyncTexBackward) return;
    let textToSearch = customText?.trim();

    // Selection now lives in our own DOM (pdf.js text layer), so this
    // reliably picks up whatever the user just double-clicked or selected.
    if (!textToSearch) {
      const sel = window.getSelection()?.toString().trim();
      if (sel && sel.length > 0 && sel.length < 200) {
        textToSearch = sel;
      }
    }

    // Fall back to the last real click position on the page rather than a
    // fixed coordinate, so results differ per click instead of always
    // resolving to the same line.
    const click = lastClickRef.current;
    const page = click?.page ?? currentPage;
    const x = click?.x ?? 150;
    const y = click?.y ?? 300;
    onSyncTexBackward(page, x, y, textToSearch);
  };

  const handlePageDoubleClick = (pageNumber: number) => (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSyncTexBackward) return;
    const canvas = pageCanvasRefs.current[pageNumber - 1];
    const dims = pageDims[pageNumber - 1];
    if (!canvas || !dims) return;

    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const xPt = cssX / scale;
    const yPt = dims.height - cssY / scale; // PDF origin is bottom-left

    lastClickRef.current = { page: pageNumber, x: xPt, y: yPt };
    setCurrentPage(pageNumber);

    // Prefer the word reconstructed from the PDF's own text-content data
    // (robust to kerning-split spans); fall back to the browser's native
    // double-click selection if that lookup can't place the click on text.
    const word = getWordAtPoint(pageNumber - 1, xPt, yPt);
    const sel = word || window.getSelection()?.toString().trim();
    onSyncTexBackward(pageNumber, xPt, yPt, sel && sel.length > 0 && sel.length < 200 ? sel : undefined);
  };

  const handleContainerScroll = () => {
    const container = containerRef.current;
    if (!container || pageRefs.current.length === 0) return;
    const scrollMid = container.scrollTop + container.clientHeight / 3;
    let page = 1;
    for (let i = 0; i < pageRefs.current.length; i++) {
      const el = pageRefs.current[i];
      if (el && el.offsetTop <= scrollMid) {
        page = i + 1;
      }
    }
    setCurrentPage(page);

    if (!isRestoringScrollRef.current) {
      updateViewportAnchor();
    }
  };

  const handleCopyAIPrompt = (err: CompileErrorItem, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const prompt = `I am compiling a LaTeX document locally and encountered this compilation error:

**Error**: ${err.message}
**Location**: ${err.file || 'main.tex'}${err.line > 0 ? `, Line ${err.line}` : ''}
${err.friendlyExplanation ? `**Diagnosis**: ${err.friendlyExplanation}` : ''}
${err.raw ? `\n**Raw TeX Output**:\n\`\`\`\n${err.raw.slice(0, 500)}\n\`\`\`` : ''}

How do I resolve this LaTeX error? Please explain the exact cause and provide the corrected code snippet.`;

    navigator.clipboard.writeText(prompt);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2500);
  };


  useEffect(() => {
    localStorage.setItem('overleaf-copy:pdf-zoom', zoom.toString());
  }, [zoom]);

  useEffect(() => {
    localStorage.setItem('overleaf-copy:pdf-night', invertColors.toString());
  }, [invertColors]);

  // Display active pdfUrl or fallback to last valid PDF url
  const activePdf = pdfUrl || lastValidPdfUrl;
  const isShowingStalePdf = !pdfUrl && !!lastValidPdfUrl && compileStatus === 'failed';

  const effectiveDownloadName = downloadFileName
    ? (downloadFileName.toLowerCase().endsWith('.pdf') ? downloadFileName : `${downloadFileName}.pdf`)
    : 'document.pdf';

  const downloadHref = activePdf
    ? `${activePdf}${activePdf.includes('?') ? '&' : '?'}download=1&filename=${encodeURIComponent(effectiveDownloadName)}`
    : '#';

  const handleDownloadClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!activePdf) return;
    e.preventDefault();
    try {
      const res = await fetch(activePdf);
      if (!res.ok) throw new Error('Fetch failed');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = effectiveDownloadName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      const fallbackLink = document.createElement('a');
      fallbackLink.href = downloadHref;
      fallbackLink.download = effectiveDownloadName;
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      document.body.removeChild(fallbackLink);
    }
  };

  // Load the PDF document with pdf.js. On a recompile, activePdf changes to
  // a fresh cache-busted URL -- remember the scroll position beforehand so
  // it can be restored once the new document's pages are laid out, instead
  // of always snapping back to the top.
  useEffect(() => {
    if (!activePdf) {
      pdfDocRef.current = null;
      setNumPages(0);
      setPageDims([]);
      return;
    }

    let cancelled = false;
    const hadPreviousDoc = !!pdfDocRef.current;
    if (hadPreviousDoc && containerRef.current) {
      restoreScrollTopRef.current = containerRef.current.scrollTop;
    }

    const loadingTask = pdfjsLib.getDocument(activePdf);
    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        pdfDocRef.current = doc;
        const dims: PageDims[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          dims.push({ width: viewport.width, height: viewport.height });
        }
        if (cancelled) return;
        setNumPages(doc.numPages);
        setPageDims(dims);
      })
      .catch(() => {
        if (!cancelled) {
          pdfDocRef.current = null;
          setNumPages(0);
          setPageDims([]);
        }
      });

    return () => {
      cancelled = true;
      loadingTask.destroy?.();
    };
  }, [activePdf]);

  // Once page geometry is known (and thus the scrollable area has its final
  // height), restore the scroll position saved before this reload.
  useLayoutEffect(() => {
    if (restoreScrollTopRef.current != null && containerRef.current) {
      containerRef.current.scrollTop = restoreScrollTopRef.current;
      restoreScrollTopRef.current = null;
    }
  }, [pageDims]);

  // When scale changes (e.g. user toggles between Full PDF and Split mode,
  // or changes zoom), restore the container scrollTop so that the exact section
  // previously in the user's reading focus stays anchored in view.
  useLayoutEffect(() => {
    if (pageDims.length === 0 || !containerRef.current) return;
    const prevScale = prevScaleRef.current;
    prevScaleRef.current = scale;

    if (Math.abs(scale - prevScale) > 0.0001 && viewportAnchorRef.current) {
      const anchor = viewportAnchorRef.current;
      const pageIdx = anchor.page - 1;
      const pageEl = pageRefs.current[pageIdx];
      const dims = pageDims[pageIdx];
      if (pageEl && dims) {
        const newOffsetInPagePx = Math.max(0, (dims.height - anchor.yPt) * scale);
        const newScrollTop = Math.max(0, pageEl.offsetTop + newOffsetInPagePx - anchor.offsetFromTop);

        isRestoringScrollRef.current = true;
        containerRef.current.scrollTop = newScrollTop;
        requestAnimationFrame(() => {
          isRestoringScrollRef.current = false;
        });
      }
    }
  }, [scale, pageDims]);

  // Render each page's canvas + selectable text layer at the current scale.
  useEffect(() => {
    const doc = pdfDocRef.current;
    if (!doc || pageDims.length === 0) return;
    let cancelled = false;
    const activeTasks: any[] = [];

    (async () => {
      for (let i = 1; i <= doc.numPages; i++) {
        if (cancelled) break;
        const canvas = pageCanvasRefs.current[i - 1];
        if (!canvas) continue;

        const page = await doc.getPage(i);
        if (cancelled) break;
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        activeTasks.push(renderTask);
        await renderTask.promise.catch(() => {});
        if (cancelled) break;

        const textLayerDiv = pageTextLayerRefs.current[i - 1];
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          const textContent = await page.getTextContent();
          if (cancelled) break;

          pageTextItemsRef.current[i - 1] = (textContent.items as any[])
            .filter((it) => typeof it.str === 'string' && it.str.length > 0)
            .map((it) => ({
              str: it.str,
              x: it.transform[4],
              y: it.transform[5],
              width: it.width,
              height: it.height || Math.abs(it.transform[3]) || 10,
            }));

          const textLayer = new (pdfjsLib as any).TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
          });
          await textLayer.render().catch(() => {});
        }
      }
    })();

    return () => {
      cancelled = true;
      activeTasks.forEach((t) => t.cancel?.());
    };
  }, [numPages, pageDims, scale]);

  // Handle SyncTeX Forward Target: scroll the target page (and roughly the
  // target line's vertical position within it) into view.
  useEffect(() => {
    if (!synctexTarget) return;
    // Guard against re-executing an already handled sync target
    // (e.g. when pageDims updates after a document recompile or zoom changes).
    if (lastHandledSyncTargetRef.current === synctexTarget.timestamp) return;

    setActiveSyncToast(synctexTarget);
    setCurrentPage(synctexTarget.page);

    if (pageDims.length === 0) return;

    const performScroll = () => {
      const el = pageRefs.current[synctexTarget.page - 1];
      const container = containerRef.current;
      if (!el || !container) return;

      const dims = pageDims[synctexTarget.page - 1];
      if (!dims) return;

      const centerOffset = container.clientHeight ? Math.min(220, container.clientHeight * 0.35) : 140;
      let offsetWithinPage = 0;
      if (typeof synctexTarget.y === 'number') {
        const yFromTop = dims.height - synctexTarget.y;
        offsetWithinPage = Math.max(0, yFromTop * scale - centerOffset);
      }
      const targetScrollTop = el.offsetTop + offsetWithinPage;

      isRestoringScrollRef.current = true;
      container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
      lastHandledSyncTargetRef.current = synctexTarget.timestamp;

      if (typeof synctexTarget.y === 'number') {
        viewportAnchorRef.current = {
          page: synctexTarget.page,
          yPt: synctexTarget.y,
          offsetFromTop: centerOffset,
        };
      }

      setTimeout(() => {
        isRestoringScrollRef.current = false;
      }, 400);

      onSyncTexHandled?.();
    };

    performScroll();
    const raf = requestAnimationFrame(performScroll);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [synctexTarget, pageDims, scale, onSyncTexHandled]);

  // Auto-dismiss the SyncTeX notification toast after 5 seconds
  useEffect(() => {
    if (!activeSyncToast) return;
    const timer = setTimeout(() => {
      setActiveSyncToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [activeSyncToast]);

  return (
    <div className="w-full h-full flex flex-col bg-surface-light dark:bg-surface-dark select-none overflow-hidden transition-colors">
      {/* Top PDF Controls & Status Bar */}
      <div className="h-9 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder px-3 flex items-center justify-between text-xs text-stone-600 dark:text-stone-300 flex-shrink-0">
        {/* Left: Zoom controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => {
              updateViewportAnchor();
              setIsFitWidth(false);
              localStorage.setItem('overleaf-copy:pdf-fit-width', 'false');
              setZoom((z) => Math.max(50, z - 10));
            }}
            title="Zoom Out"
            className="p-1 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 transition btn-tactile"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono w-10 text-center text-[11px] text-stone-700 dark:text-stone-300">{zoom}%</span>
          <button
            onClick={() => {
              updateViewportAnchor();
              setIsFitWidth(false);
              localStorage.setItem('overleaf-copy:pdf-fit-width', 'false');
              setZoom((z) => Math.min(200, z + 10));
            }}
            title="Zoom In"
            className="p-1 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 transition btn-tactile"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleToggleFitWidth}
            title={isFitWidth ? 'Fit to Width (Active) (F)' : 'Fit to Width (F)'}
            className={`p-1 rounded transition text-[10px] btn-tactile ${
              isFitWidth
                ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark font-medium border border-scholarly/30 dark:border-scholarly-dark/40'
                : 'hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-500'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              updateViewportAnchor();
              setIsFitWidth(false);
              localStorage.setItem('overleaf-copy:pdf-fit-width', 'false');
              setZoom(80);
            }}
            title="Reset Zoom (80%)"
            className="p-1 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 transition text-[10px] btn-tactile text-stone-500"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Center: Compilation Status Badge */}
        <div className="flex items-center space-x-1.5 font-sans">
          {compileStatus === 'compiling' && (
            <div className="flex items-center space-x-1 text-stone-600 dark:text-stone-300 text-[11px] font-medium">
              <Loader2 className="w-3 h-3 animate-spin text-scholarly dark:text-scholarly-dark" />
              <span>Compiling...</span>
            </div>
          )}
          {compileStatus === 'success' && (
            <div className="flex items-center space-x-1 text-scholarly dark:text-scholarly-dark text-[11px] font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>
                Compiled {compileDuration !== null ? `${(compileDuration / 1000).toFixed(1)}s` : ''}
              </span>
            </div>
          )}
          {compileStatus === 'failed' && (
            <div className="flex items-center space-x-1 text-crimson dark:text-crimson-dark text-[11px] font-medium">
              <AlertTriangle className="w-3 h-3" />
              <span>Compilation failed</span>
            </div>
          )}
          {isShowingStalePdf && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 font-medium">
              showing previous PDF
            </span>
          )}
        </div>

        {/* Right: SyncTeX Backward, Night filter, download, collapse */}
        <div className="flex items-center space-x-1.5">
          {onSyncTexBackward && activePdf && (
            <div className="flex items-center space-x-1">
              {showSearchInput ? (
                <div className="flex items-center bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 rounded px-1.5 py-0.5 shadow-xs">
                  <Search className="w-3 h-3 text-stone-500 mr-1 flex-shrink-0" />
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
                    className="w-36 bg-transparent text-[11px] text-stone-800 dark:text-stone-100 outline-none placeholder-stone-400 font-sans"
                  />
                  <button
                    onClick={() => handleBackwardJump(jumpSearchText)}
                    disabled={isSyncingBackward}
                    title="Jump to LaTeX code containing this text"
                    className="p-0.5 hover:text-scholarly dark:hover:text-scholarly-dark transition"
                  >
                    {isSyncingBackward ? (
                      <Loader2 className="w-3 h-3 animate-spin text-scholarly" />
                    ) : (
                      <ArrowLeft className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
                    )}
                  </button>
                  <button
                    onClick={() => setShowSearchInput(false)}
                    className="p-0.5 hover:text-stone-700 text-stone-400 transition ml-0.5"
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
                    className="flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-surface-lightPanel dark:bg-surface-darkPanel hover:bg-stone-200/60 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 border border-surface-lightBorder dark:border-surface-darkBorder transition disabled:opacity-50 btn-tactile"
                  >
                    {isSyncingBackward ? (
                      <Loader2 className="w-3 h-3 animate-spin text-scholarly" />
                    ) : (
                      <ArrowLeft className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
                    )}
                    <span className="hidden sm:inline">To Code</span>
                  </button>
                  <button
                    onClick={() => setShowSearchInput(true)}
                    title="Jump by text search in source code"
                    className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/80 dark:hover:bg-stone-800 transition btn-tactile"
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
            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition text-[11px] btn-tactile ${
              invertColors
                ? 'bg-stone-800 text-stone-100 dark:bg-stone-200 dark:text-stone-900 font-medium'
                : 'hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-500'
            }`}
          >
            {invertColors ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
            <span className="hidden sm:inline">Night</span>
          </button>

          {activePdf && (
            <a
              href={downloadHref}
              download={effectiveDownloadName}
              onClick={handleDownloadClick}
              title={`Download ${effectiveDownloadName}`}
              className="p-1 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 text-scholarly dark:text-scholarly-dark transition flex items-center space-x-1 btn-tactile"
            >
              <Download className="w-3.5 h-3.5" />
            </a>
          )}

          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse PDF Viewer"
              className="p-1 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition btn-tactile"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* PDF Viewport & Error Overlay Area */}
      <div
        ref={containerRef}
        onScroll={handleContainerScroll}
        className="flex-1 overflow-auto p-4 relative"
      >
        <div className="min-w-fit w-full flex flex-col items-center justify-start">
        {/* Error Diagnostics Banner */}
        {compileErrors.length > 0 && (() => {
          const rootErrorsCount = compileErrors.filter((e) => !e.isCascading).length;
          const cascadeErrorsCount = compileErrors.filter((e) => e.isCascading).length;

          return (
            <div className="w-full max-w-2xl mb-4 bg-crimson-subtle/70 dark:bg-crimson-darkSubtle/60 border border-crimson/30 rounded-lg p-3 text-xs space-y-2.5 shadow-md flex-shrink-0 animate-in fade-in duration-150 font-sans">
              <div className="flex items-center justify-between font-semibold text-crimson dark:text-crimson-dark">
                <span className="flex items-center space-x-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  <span>
                    Compilation Diagnostics ({rootErrorsCount} root issue{rootErrorsCount === 1 ? '' : 's'}
                    {cascadeErrorsCount > 0 ? `, ${cascadeErrorsCount} secondary` : ''})
                  </span>
                </span>
                <div className="flex items-center space-x-2">
                  {canUndoFix && onUndoFix && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUndoFix();
                      }}
                      title="Revert previous automatic fix and restore code"
                      className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-300 border border-stone-300 dark:border-stone-700 transition shadow-xs btn-tactile"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>Undo Fix</span>
                    </button>
                  )}
                  <span className="text-[10px] text-stone-500 font-normal">
                    {isShowingStalePdf ? 'Showing last valid PDF below' : 'Fix errors to generate PDF'}
                  </span>
                </div>
              </div>

              {/* Proactive Batch Fix Banner: when multiple missing packages are detected */}
              {detectedMissingPackages && detectedMissingPackages.length > 1 && onApplyBatchFix && (
                <div className="p-2.5 rounded-md bg-scholarly-subtle/80 dark:bg-scholarly-darkSubtle/70 border border-scholarly/30 dark:border-scholarly-dark/40 flex items-center justify-between shadow-xs">
                  <div className="flex items-center space-x-2 min-w-0">
                    <Wrench className="w-4 h-4 text-scholarly dark:text-scholarly-dark flex-shrink-0" />
                    <span className="text-stone-800 dark:text-stone-200 text-xs truncate">
                      Detected <strong>{detectedMissingPackages.length}</strong> missing packages across document:{' '}
                      <span className="font-mono font-medium text-scholarly dark:text-scholarly-dark">
                        {detectedMissingPackages.map((p) => `\\usepackage{${p.packageName}}`).join(', ')}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onApplyBatchFix(detectedMissingPackages);
                    }}
                    title="Inject all missing packages into preamble in one operation"
                    className="flex items-center space-x-1.5 px-3 py-1 rounded text-[11px] font-medium bg-scholarly hover:bg-scholarly-dark text-white dark:bg-scholarly-dark dark:hover:bg-scholarly shadow-xs transition btn-tactile flex-shrink-0 ml-3"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Add All ({detectedMissingPackages.length})</span>
                  </button>
                </div>
              )}

              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {compileErrors.map((err, idx) => {
                  const isFigureError =
                    err.message.toLowerCase().includes('figure') ||
                    err.message.includes('image') ||
                    err.friendlyExplanation?.includes('Figure');
                  const fileName = err.file ? err.file.split(/[/\\]/).pop() : 'main.tex';

                  return (
                    <div
                      key={idx}
                      onClick={() => err.line && onSelectErrorLine?.(err.line)}
                      className={`p-2.5 rounded-md bg-surface-lightPanel dark:bg-surface-darkPanel border cursor-pointer transition space-y-2 ${
                        err.isCascading
                          ? 'border-stone-200 dark:border-stone-800/80 opacity-85 hover:opacity-100'
                          : 'border-crimson/30 dark:border-crimson-dark/30 hover:border-crimson/60 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-1.5 font-medium min-w-0">
                          {isFigureError && <ImageOff className="w-3.5 h-3.5 text-diagnostic dark:text-diagnostic-dark flex-shrink-0" />}
                          <span className="font-mono text-crimson dark:text-crimson-dark text-xs whitespace-nowrap font-semibold">
                            {err.line > 0 ? `Line ${err.line}` : 'Compile Error'}
                          </span>
                          <span className="text-stone-400 text-[10px] font-mono truncate" title={err.file}>
                            ({fileName})
                          </span>
                          {err.isCascading ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-normal bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 whitespace-nowrap">
                              Cascades from Line {err.cascadingFromLine || 1}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-sans font-medium bg-crimson-subtle dark:bg-crimson-darkSubtle text-crimson dark:text-crimson-dark border border-crimson/20 whitespace-nowrap">
                              Root Cause
                            </span>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 flex-shrink-0">
                          {/* 1-Click Quick Fix Button */}
                          {err.suggestedFix && onApplyFix && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApplyFix(err.suggestedFix!);
                              }}
                              title={err.suggestedFix.description}
                              className="flex items-center space-x-1.5 px-2.5 py-1 rounded text-[10px] font-medium bg-scholarly hover:bg-scholarly-dark text-white dark:bg-scholarly-dark dark:hover:bg-scholarly shadow-xs transition btn-tactile"
                            >
                              <Wrench className="w-3 h-3 flex-shrink-0" />
                              <span>{err.suggestedFix.label}</span>
                            </button>
                          )}

                          {/* 1-Click Copy Prompt Button */}
                          <button
                            onClick={(e) => handleCopyAIPrompt(err, idx, e)}
                            title="Copy error prompt to clipboard"
                            className="flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-medium bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-700 dark:text-stone-200 border border-stone-300 dark:border-stone-700 transition btn-tactile"
                          >
                            {copiedIndex === idx ? (
                              <>
                                <Check className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
                                <span className="text-scholarly dark:text-scholarly-dark font-medium">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-stone-500" />
                                <span>Copy Prompt</span>
                              </>
                            )}
                          </button>

                          {err.line > 0 && (
                            <span className="text-stone-400 hover:text-scholarly text-[10px] font-medium">
                              Jump →
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-stone-800 dark:text-stone-200 font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                        {err.message}
                      </p>

                      {/* Recommended Fix Box */}
                      {err.suggestedFix && (
                        <div className="p-2 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 text-[11px] font-sans flex items-center justify-between">
                          <span className="flex items-center space-x-1.5">
                            <Wrench className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark flex-shrink-0" />
                            <span><strong>Recommended fix:</strong> {err.suggestedFix.description}</span>
                          </span>
                          {onApplyFix && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onApplyFix(err.suggestedFix!);
                              }}
                              className="underline text-[10px] font-medium text-scholarly dark:text-scholarly-dark hover:opacity-80 flex-shrink-0 ml-2"
                            >
                              Apply Fix →
                            </button>
                          )}
                        </div>
                      )}

                      {err.friendlyExplanation && !err.suggestedFix && (
                        <div className="p-1.5 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 text-[11px] font-sans flex items-center space-x-1.5">
                          <Info className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                          <span>{err.friendlyExplanation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* SyncTeX Floating Notification Banner */}
        {activeSyncToast && (
          <div className="sticky top-2 z-40 mb-3 flex items-center space-x-2.5 px-4 py-2 rounded-full bg-stone-900 dark:bg-stone-100 text-stone-100 dark:text-stone-900 shadow-xl border border-stone-700 dark:border-stone-300 text-xs animate-in fade-in slide-in-from-top-3 duration-200">
            <div className="w-2 h-2 rounded-full bg-scholarly dark:bg-scholarly-dark flex-shrink-0" />
            <span className="font-medium font-sans">
              SyncTeX: <strong>Page {activeSyncToast.page}</strong>, Line {activeSyncToast.line} ({activeSyncToast.file})
            </span>
            <button
              onClick={() => setActiveSyncToast(null)}
              className="p-0.5 text-stone-400 hover:text-white dark:hover:text-black transition rounded"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* PDF pages rendered via pdf.js: real canvas + selectable text layer,
            so double-click text selection and click coordinates are both
            accurate (unlike the native browser plugin previously used via
            an <iframe>, which is fully opaque to the host page). */}
        {numPages > 0 ? (
          <div className="flex flex-col items-center gap-4 select-text mx-auto">
            {Array.from({ length: numPages }, (_, idx) => {
              const pageNumber = idx + 1;
              const dims = pageDims[idx];
              return (
                <div
                  key={pageNumber}
                  ref={(el) => {
                    pageRefs.current[idx] = el;
                  }}
                  data-page-number={pageNumber}
                  onDoubleClick={handlePageDoubleClick(pageNumber)}
                  className="relative shadow-md dark:shadow-2xl bg-white select-text cursor-text"
                  style={{
                    width: dims ? `${dims.width * scale}px` : undefined,
                    height: dims ? `${dims.height * scale}px` : undefined,
                    filter: invertColors ? 'invert(0.9) hue-rotate(180deg)' : 'none',
                  }}
                  title="Double-click any word to jump back to source code (SyncTeX)"
                >
                  <canvas
                    ref={(el) => {
                      pageCanvasRefs.current[idx] = el;
                    }}
                    className="block"
                  />
                  <div
                    ref={(el) => {
                      pageTextLayerRefs.current[idx] = el;
                    }}
                    className="textLayer"
                  />
                </div>
              );
            })}
          </div>
        ) : activePdf && compileStatus !== 'failed' ? (
          <div className="flex flex-col items-center justify-center text-stone-400 text-center p-8 space-y-3 font-sans w-full py-24 animate-in fade-in duration-200">
            <Loader2 className="w-7 h-7 text-scholarly dark:text-scholarly-dark animate-spin" />
            <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">Loading PDF preview...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-stone-400 text-center p-8 space-y-3 font-sans w-full py-16">
            <div className="w-12 h-12 rounded-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-center text-scholarly dark:text-scholarly-dark">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-200 font-serif">No PDF Generated Yet</h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 max-w-sm mt-1">
                Click <span className="text-scholarly dark:text-scholarly-dark font-medium">Recompile</span> or press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-xs text-stone-700 dark:text-stone-300">
                  Ctrl+Enter
                </kbd>{' '}
                to compile your local document without cloud quotas.
              </p>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
});

PDFViewer.displayName = 'PDFViewer';
