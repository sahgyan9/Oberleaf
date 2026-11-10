/**
 * Visual mode for the Monaco source editor.
 *
 * Everything here is view-only: decorations, injected text, content widgets,
 * view zones and hidden line ranges. The model text, undo stack, Yjs binding
 * and markers are never touched, so switching modes is just attaching or
 * detaching this controller. A construct the cursor is in is shown as source;
 * a construct this file cannot render (a KaTeX error, an unknown layout) is
 * left as source.
 */
import katex from 'katex';
import type * as MonacoNs from 'monaco-editor';
import {
  parseVisualConstructs,
  extractKatexMacros,
  VisualConstruct,
  DisplayMathConstruct,
  FigureConstruct,
  InlineMathConstruct,
} from '../../utils/visualLatex';
import { findProjectImages, hasThumbnail, previewImageUrl, resolveProjectImage } from '../../utils/imageHelper';
import { cleanLatexTitle } from '../../utils/latexOutline';
import type { ProjectContext } from '../../utils/latexCompletions';
import './visualMode.css';

type Editor = MonacoNs.editor.IStandaloneCodeEditor;
type Monaco = typeof MonacoNs;
type Block = DisplayMathConstruct | FigureConstruct;

const HIDDEN_AREA_SOURCE = 'oberleaf-visual-mode';
const BODY_FONT_SIZE = 16;
const FIGURE_IMAGE_HEIGHT = 200;
/** Inline math widgets are created for this many lines around the viewport. */
const WIDGET_MARGIN_LINES = 60;
/**
 * Inline decorations (hidden markup, chips, bullets) only change a line's
 * horizontal layout, so they are kept to this many lines around the viewport.
 * Anything that changes heights (headings, hidden blocks, zones) covers the
 * whole document so scrolling never shifts content.
 */
const DECORATION_WINDOW_LINES = 200;

export const VISUAL_EDITOR_OPTIONS = {
  fontFamily: "'Newsreader', Georgia, serif",
  fontSize: BODY_FONT_SIZE,
  wrappingStrategy: 'advanced',
  disableMonospaceOptimizations: true,
} as const;

/** Heading line height relative to the body line height; font sizes are in visualMode.css. */
const HEADING_LINE_SCALE: Record<number, number> = { 1: 1.9, 2: 1.65, 3: 1.4, 4: 1.2, 5: 1 };

interface Rendered {
  html: string;
  width: number;
  height: number;
}

interface ZoneEntry {
  id: string;
  key: string;
  block: Block;
}

class InlineMathWidget implements MonacoNs.editor.IContentWidget {
  readonly allowEditorOverflow = false;
  readonly suppressMouseDown = true;
  private readonly node: HTMLElement;
  constructor(
    private readonly id: string,
    private position: MonacoNs.editor.IContentWidgetPosition,
    html: string,
    lineHeight: number,
    onActivate: () => void
  ) {
    this.node = document.createElement('div');
    this.node.className = 'vm-inline-math';
    // Same font and line box as the editor line, so the math sits on the text baseline.
    this.node.style.height = `${lineHeight}px`;
    this.node.style.lineHeight = `${lineHeight}px`;
    this.node.innerHTML = html;
    this.node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onActivate();
    });
  }
  getId() {
    return this.id;
  }
  getDomNode() {
    return this.node;
  }
  getPosition() {
    return this.position;
  }
  setPosition(position: MonacoNs.editor.IContentWidgetPosition) {
    this.position = position;
  }
}

function hashString(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export class VisualModeController {
  private enabled = false;
  private constructs: VisualConstruct[] = [];
  private macros: Record<string, string> = {};
  private readonly decorations: MonacoNs.editor.IEditorDecorationsCollection;
  private zones: ZoneEntry[] = [];
  private constructLines = new Map<VisualConstruct, number>();
  private window: [number, number] = [0, 0];
  private widgets = new Map<string, InlineMathWidget>();
  private hiddenBlocks: Block[] = [];
  private listeners: MonacoNs.IDisposable[] = [];
  private parseTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSignature = '';
  private lastCursorLine = 0;
  private inlineCache = new Map<string, Rendered | null>();
  private blockCache = new Map<string, string | null>();
  private measureHost: HTMLElement | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private widthClasses = new Set<number>();
  private fontsHandler: (() => void) | null = null;

  constructor(
    private readonly editor: Editor,
    private readonly monaco: Monaco,
    private readonly getProjectContext: () => ProjectContext | undefined,
    private readonly codeOptions: MonacoNs.editor.IEditorOptions
  ) {
    this.decorations = editor.createDecorationsCollection();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    const editor = this.editor;
    if (on) {
      editor.updateOptions(VISUAL_EDITOR_OPTIONS as MonacoNs.editor.IEditorOptions);
      this.listeners = [
        editor.onDidChangeModelContent(() => this.scheduleParse()),
        editor.onDidChangeModel(() => {
          this.clearRendering();
          this.parseNow();
        }),
        editor.onDidChangeCursorSelection(() => this.render(false)),
        editor.onDidChangeCursorPosition((e) => this.handleCursorMove(e)),
        editor.onDidScrollChange((e) => {
          if (!e.scrollTopChanged) return;
          if (this.windowIsStale()) this.render(true);
          else this.syncWidgets();
        }),
        editor.onDidLayoutChange(() => this.render(true)),
        editor.onMouseDown((e) => this.handleMouseDown(e)),
      ];
      this.fontsHandler = () => {
        this.inlineCache.clear();
        this.render(true);
      };
      document.fonts?.addEventListener?.('loadingdone', this.fontsHandler);
      this.parseNow();
      document.fonts?.ready.then(() => this.enabled && this.fontsHandler?.());
    } else {
      if (this.parseTimer) clearTimeout(this.parseTimer);
      this.parseTimer = null;
      this.listeners.forEach((d) => d.dispose());
      this.listeners = [];
      if (this.fontsHandler) document.fonts?.removeEventListener?.('loadingdone', this.fontsHandler);
      this.fontsHandler = null;
      this.clearRendering();
      editor.updateOptions(this.codeOptions);
    }
  }

  dispose(): void {
    try {
      this.setEnabled(false);
    } catch {
      // The editor may already be disposed; nothing of ours is left in its view then.
    }
    this.measureHost?.remove();
    this.styleEl?.remove();
  }

  // ---------------------------------------------------------------- parsing

  private scheduleParse(): void {
    if (this.parseTimer) clearTimeout(this.parseTimer);
    this.parseTimer = setTimeout(() => this.parseNow(), 60);
  }

  private parseNow(): void {
    this.parseTimer = null;
    const model = this.editor.getModel();
    if (!model) return;
    const text = model.getValue();
    this.constructs = parseVisualConstructs(text);
    this.constructLines = new Map(this.constructs.map((c) => [c, model.getPositionAt(c.start).lineNumber]));
    const macros = extractKatexMacros(text);
    if (JSON.stringify(macros) !== JSON.stringify(this.macros)) {
      this.macros = macros;
      this.inlineCache.clear();
      this.blockCache.clear();
    }
    this.render(true);
  }

  // ---------------------------------------------------------------- KaTeX

  private host(): HTMLElement {
    if (!this.measureHost) {
      const el = document.createElement('div');
      el.className = 'vm-measure';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
      this.measureHost = el;
    }
    return this.measureHost;
  }

  private katexHtml(math: string, displayMode: boolean): string | null {
    try {
      return katex.renderToString(math, {
        displayMode,
        throwOnError: true,
        strict: 'ignore',
        trust: false,
        macros: { ...this.macros },
      });
    } catch {
      return null;
    }
  }

  private renderInline(math: string): Rendered | null {
    if (this.inlineCache.has(math)) return this.inlineCache.get(math)!;
    const html = this.katexHtml(math, false);
    let result: Rendered | null = null;
    if (html) {
      const host = this.host();
      host.style.width = 'auto';
      host.innerHTML = `<span class="vm-inline-math-measure">${html}</span>`;
      const rect = (host.firstElementChild as HTMLElement).getBoundingClientRect();
      result = { html, width: Math.ceil(rect.width) + 2, height: Math.ceil(rect.height) };
      host.innerHTML = '';
    }
    this.inlineCache.set(math, result);
    return result;
  }

  private renderDisplay(math: string): string | null {
    if (this.blockCache.has(math)) return this.blockCache.get(math)!;
    const html = this.katexHtml(math, true);
    this.blockCache.set(math, html);
    return html;
  }

  private widthClass(width: number): string {
    if (!this.styleEl) {
      this.styleEl = document.createElement('style');
      this.styleEl.id = 'oberleaf-visual-mode-widths';
      document.head.appendChild(this.styleEl);
    }
    if (!this.widthClasses.has(width)) {
      this.widthClasses.add(width);
      this.styleEl.sheet?.insertRule(`.vm-slot-${width} { display: inline-block; width: ${width}px; }`);
    }
    return `vm-slot-${width}`;
  }

  // ---------------------------------------------------------------- activity

  /** Constructs touched by a cursor or selection are shown as source. */
  private activeSet(constructs: VisualConstruct[]): Set<VisualConstruct> {
    const model = this.editor.getModel();
    const active = new Set<VisualConstruct>();
    if (!model) return active;
    const selections = this.editor.getSelections() ?? [];
    const spans = selections.map((s) => ({
      from: model.getOffsetAt(s.getStartPosition()),
      to: model.getOffsetAt(s.getEndPosition()),
      fromLine: s.startLineNumber - 1,
      toLine: s.endLineNumber - 1,
    }));
    for (const c of constructs) {
      for (const s of spans) {
        let hit: boolean;
        if (c.kind === 'displayMath' || c.kind === 'figure') {
          hit = s.fromLine <= c.endLine && s.toLine >= c.startLine;
        } else if (c.kind === 'heading') {
          hit = s.from <= c.end && s.to >= c.start;
        } else if (s.from === s.to) {
          hit = s.from > c.start && s.from < c.end;
        } else {
          hit = s.from < c.end && s.to > c.start;
        }
        if (hit) {
          active.add(c);
          break;
        }
      }
    }
    return active;
  }

  // ---------------------------------------------------------------- rendering

  private visibleLines(): [number, number] {
    const visible = this.editor.getVisibleRanges();
    const first = visible[0]?.startLineNumber ?? 1;
    return [first, visible[visible.length - 1]?.endLineNumber ?? first];
  }

  /** True when the viewport has come within half a window of the decorated range's edge. */
  private windowIsStale(): boolean {
    const [first, last] = this.visibleLines();
    const [start, end] = this.window;
    const lineCount = this.editor.getModel()?.getLineCount() ?? 0;
    const margin = DECORATION_WINDOW_LINES / 2;
    return (start > 1 && first - start < margin) || (end < lineCount && end - last < margin) || end === 0;
  }

  private moveWindow(): void {
    const [first, last] = this.visibleLines();
    this.window = [Math.max(1, first - DECORATION_WINDOW_LINES), last + DECORATION_WINDOW_LINES];
  }

  private clearRendering(): void {
    this.decorations.clear();
    this.setHiddenAreas([]);
    this.editor.changeViewZones((acc) => this.zones.forEach((z) => acc.removeZone(z.id)));
    this.zones = [];
    this.widgets.forEach((w) => this.editor.removeContentWidget(w));
    this.widgets.clear();
    this.hiddenBlocks = [];
    this.window = [0, 0];
    this.lastSignature = '';
  }

  private render(force: boolean): void {
    if (!this.enabled) return;
    const model = this.editor.getModel();
    if (!model) return;
    if (force || this.windowIsStale()) this.moveWindow();
    const [windowStart, windowEnd] = this.window;
    const relevant = this.constructs.filter((c) => {
      if (c.kind === 'displayMath' || c.kind === 'figure' || c.kind === 'heading') return true;
      const line = this.constructLines.get(c) ?? 0;
      return line >= windowStart && line <= windowEnd;
    });
    const active = this.activeSet(relevant);
    const signature = `${windowStart}:${relevant.map((c) => (active.has(c) ? '1' : '0')).join('')}`;
    if (!force && signature === this.lastSignature) return;
    this.lastSignature = signature;

    const monaco = this.monaco;
    const range = (start: number, end: number) => {
      const a = model.getPositionAt(start);
      const b = model.getPositionAt(end);
      return new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column);
    };
    const hide = (start: number, end: number): MonacoNs.editor.IModelDeltaDecoration => ({
      range: range(start, end),
      options: { inlineClassName: 'vm-hidden', inlineClassNameAffectsLetterSpacing: true },
    });
    const markup = (start: number, end: number): MonacoNs.editor.IModelDeltaDecoration => ({
      range: range(start, end),
      options: { inlineClassName: 'vm-markup' },
    });
    const replace = (start: number, end: number, content: string, className: string, data?: unknown) => [
      hide(start, end),
      {
        range: range(start, start),
        options: {
          before: {
            content,
            inlineClassName: className,
            inlineClassNameAffectsLetterSpacing: true,
            cursorStops: monaco.editor.InjectedTextCursorStops.None,
            attachedData: data,
          },
          showIfCollapsed: true,
        },
      },
    ];

    const bodyLineHeight = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
    const decorations: MonacoNs.editor.IModelDeltaDecoration[] = [];
    const blocks: Block[] = [];
    const inlineMath: Array<{ c: InlineMathConstruct; rendered: Rendered }> = [];

    for (const c of relevant) {
      const isActive = active.has(c);
      switch (c.kind) {
        case 'heading': {
          const line = model.getPositionAt(c.start).lineNumber;
          // Monaco 0.56 applies this value as pixels, despite the typings describing a multiplier.
          const lineHeight = Math.round(bodyLineHeight * (HEADING_LINE_SCALE[c.level] ?? 1));
          decorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: { lineHeight, isWholeLine: true },
          });
          decorations.push({
            range: range(c.contentStart, c.contentEnd),
            options: { inlineClassName: `vm-heading vm-heading-${c.level}`, inlineClassNameAffectsLetterSpacing: true },
          });
          if (isActive) decorations.push(markup(c.start, c.contentStart), markup(c.contentEnd, c.end));
          else decorations.push(hide(c.start, c.contentStart), hide(c.contentEnd, c.end));
          break;
        }
        case 'format': {
          decorations.push({
            range: range(c.contentStart, c.contentEnd),
            options:
              c.style === 'mono'
                ? { inlineClassName: 'vm-mono', inlineClassNameAffectsLetterSpacing: true }
                : c.style === 'bold'
                  ? { inlineClassName: 'vm-bold', inlineClassNameAffectsLetterSpacing: true }
                  : c.style === 'italic'
                    ? { inlineClassName: 'vm-italic', inlineClassNameAffectsLetterSpacing: true }
                    : { inlineClassName: 'vm-underline' },
          });
          if (isActive) decorations.push(markup(c.start, c.contentStart), markup(c.contentEnd, c.end));
          else decorations.push(hide(c.start, c.contentStart), hide(c.contentEnd, c.end));
          break;
        }
        case 'inlineMath': {
          const rendered = isActive ? null : this.renderInline(c.math);
          if (rendered) {
            decorations.push(...replace(c.start, c.end, ' ', `vm-slot ${this.widthClass(rendered.width)}`, c.start));
            inlineMath.push({ c, rendered });
          } else {
            decorations.push({ range: range(c.start, c.end), options: { inlineClassName: 'vm-math-source' } });
          }
          break;
        }
        case 'displayMath': {
          if (!isActive && this.renderDisplay(c.math)) blocks.push(c);
          break;
        }
        case 'figure': {
          if (!isActive) blocks.push(c);
          break;
        }
        case 'listItem': {
          if (isActive) decorations.push(markup(c.start, c.end));
          else decorations.push(...replace(c.start, c.end, c.marker, `vm-list-marker vm-list-${c.listType}`, c.start));
          break;
        }
        case 'listDelimiter': {
          decorations.push({ range: range(c.start, c.end), options: { inlineClassName: 'vm-list-delimiter' } });
          break;
        }
        case 'chip': {
          if (isActive) break;
          decorations.push(...replace(c.start, c.end, c.keys.join(', '), `vm-chip vm-chip-${c.chip}`, c.start));
          break;
        }
      }
    }

    this.decorations.set(decorations);
    this.syncBlocks(blocks);
    this.inlineMath = inlineMath;
    this.syncWidgets();
  }

  // ---------------------------------------------------------------- blocks

  /**
   * Monaco's code editor widget implements setHiddenAreas (folding uses it);
   * it is not in the public typings. Ranges are kept per source, so this never
   * disturbs the user's own folds.
   */
  private setHiddenAreas(ranges: MonacoNs.IRange[]): void {
    (this.editor as unknown as { setHiddenAreas(r: MonacoNs.IRange[], source: unknown): void }).setHiddenAreas(
      ranges,
      HIDDEN_AREA_SOURCE
    );
  }

  private blockKey(b: Block): string {
    const body = b.kind === 'displayMath' ? b.math : `${b.imagePath}|${b.caption}`;
    return `${b.kind}:${b.startLine}:${b.endLine}:${hashString(body)}`;
  }

  private buildBlockNode(b: Block): HTMLElement {
    const node = document.createElement('div');
    node.className = `vm-block vm-block-${b.kind}`;
    if (b.kind === 'displayMath') {
      node.innerHTML = this.renderDisplay(b.math) ?? '';
    } else {
      const frame = document.createElement('div');
      frame.className = 'vm-figure-frame';
      frame.style.height = `${FIGURE_IMAGE_HEIGHT}px`;
      const ctx = this.getProjectContext();
      const image =
        b.imagePath && ctx ? resolveProjectImage(findProjectImages(ctx.files ?? []), b.imagePath) : undefined;
      if (image && ctx?.projectId && hasThumbnail(image.name)) {
        const img = document.createElement('img');
        img.src = previewImageUrl(ctx.projectId, image.relativePath);
        img.alt = b.caption ? cleanLatexTitle(b.caption) : image.name;
        img.draggable = false;
        frame.appendChild(img);
      } else {
        const note = document.createElement('span');
        note.className = 'vm-figure-note';
        note.textContent = !b.imagePath
          ? 'Figure without an image'
          : image
            ? `${image.relativePath} (no preview for this format)`
            : `Image not found: ${b.imagePath}`;
        frame.appendChild(note);
      }
      node.appendChild(frame);
      if (b.caption) {
        const caption = document.createElement('div');
        caption.className = 'vm-figure-caption';
        caption.innerHTML = this.captionHtml(b.caption);
        node.appendChild(caption);
      }
    }
    // Clicks reach Monaco's own hit-testing (the text layer lies above view zones); see handleMouseDown.
    return node;
  }

  /** Caption text with its inline math rendered; other markup is reduced to plain text. */
  private captionHtml(raw: string): string {
    const escape = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const plain = (t: string) =>
      t.trim() ? `${/^\s/.test(t) ? ' ' : ''}${escape(cleanLatexTitle(t))}${/\s$/.test(t) ? ' ' : ''}` : t ? ' ' : '';
    let html = '';
    let last = 0;
    const math = /(?<!\\)\$([^$]+)\$/g;
    for (let m = math.exec(raw); m; m = math.exec(raw)) {
      html += plain(raw.slice(last, m.index));
      html += this.katexHtml(m[1], false) ?? escape(m[0]);
      last = m.index + m[0].length;
    }
    return html + plain(raw.slice(last));
  }

  private measureBlock(node: HTMLElement): number {
    const host = this.host();
    const layout = this.editor.getLayoutInfo();
    host.style.width = `${Math.max(200, layout.contentWidth - layout.verticalScrollbarWidth - 8)}px`;
    host.appendChild(node);
    const height = node.getBoundingClientRect().height;
    host.removeChild(node);
    return Math.ceil(height);
  }

  private syncBlocks(blocks: Block[]): void {
    const editor = this.editor;
    const wanted = new Map(blocks.map((b) => [this.blockKey(b), b]));
    const keep = new Set<string>();
    const removed: string[] = [];
    for (const z of this.zones) {
      if (wanted.has(z.key) && !keep.has(z.key)) keep.add(z.key);
      else removed.push(z.id);
    }
    const added: Array<{ key: string; b: Block }> = [];
    wanted.forEach((b, key) => {
      if (!keep.has(key)) added.push({ key, b });
    });

    const hidden = blocks.map((b) => new this.monaco.Range(b.startLine + 1, 1, b.endLine + 1, 1));
    // Hide lines first so the zone heights are laid out against the final line map.
    this.setHiddenAreas(hidden);
    this.hiddenBlocks = blocks;

    if (removed.length === 0 && added.length === 0) return;
    const nodes = added.map(({ key, b }) => {
      const node = this.buildBlockNode(b);
      return { key, b, node, height: this.measureBlock(node) };
    });
    editor.changeViewZones((acc) => {
      removed.forEach((id) => acc.removeZone(id));
      this.zones = this.zones.filter((z) => !removed.includes(z.id));
      for (const { key, b, node, height } of nodes) {
        const id = acc.addZone({
          afterLineNumber: b.startLine,
          ordinal: b.start,
          heightInPx: height,
          domNode: node,
          suppressMouseDown: true,
          // The zone sits right above hidden lines; Monaco collapses such zones unless told otherwise.
          showInHiddenAreas: true,
        } as MonacoNs.editor.IViewZone);
        this.zones.push({ id, key, block: b });
      }
    });
  }

  /** Put the cursor into a hidden block, which shows its source. */
  private openBlock(b: Block, edge: 'start' | 'end'): void {
    const model = this.editor.getModel();
    if (!model) return;
    let line: number;
    if (edge === 'start') line = b.endLine > b.startLine ? b.startLine + 2 : b.startLine + 1;
    else line = b.endLine > b.startLine ? b.endLine : b.endLine + 1;
    const column = model.getLineFirstNonWhitespaceColumn(line) || 1;
    this.editor.setPosition({ lineNumber: line, column });
    this.editor.focus();
    this.editor.revealLineInCenterIfOutsideViewport(line);
  }

  /**
   * Arrow keys skip hidden lines. When the cursor jumps over a rendered block
   * by keyboard, put it inside the block instead.
   */
  private handleCursorMove(e: MonacoNs.editor.ICursorPositionChangedEvent): void {
    const prev = this.lastCursorLine;
    const line = e.position.lineNumber;
    this.lastCursorLine = line;
    if (e.source !== 'keyboard' || prev === 0 || Math.abs(line - prev) < 2) return;
    const lo = Math.min(prev, line);
    const hi = Math.max(prev, line);
    const crossed = this.hiddenBlocks.filter((b) => b.startLine + 1 > lo && b.endLine + 1 < hi);
    if (crossed.length === 0) return;
    const target = line > prev ? crossed[0] : crossed[crossed.length - 1];
    this.openBlock(target, line > prev ? 'start' : 'end');
  }

  private handleMouseDown(e: MonacoNs.editor.IEditorMouseEvent): void {
    const target = e.target as MonacoNs.editor.IMouseTarget & { detail?: any };
    const zoneId = target.detail?.viewZoneId;
    const zone = typeof zoneId === 'string' ? this.zones.find((z) => z.id === zoneId) : undefined;
    if (zone) {
      // Let Monaco finish placing the cursor after the zone, then move it into the block.
      setTimeout(() => this.openBlock(zone.block, 'start'), 0);
      return;
    }
    const start = target.detail?.injectedText?.options?.attachedData;
    if (typeof start !== 'number') return;
    const model = this.editor.getModel();
    if (!model) return;
    setTimeout(() => {
      this.editor.setPosition(model.getPositionAt(start + 1));
      this.editor.focus();
    }, 0);
  }

  // ---------------------------------------------------------------- inline math widgets

  private inlineMath: Array<{ c: InlineMathConstruct; rendered: Rendered }> = [];

  private syncWidgets(): void {
    const editor = this.editor;
    const model = editor.getModel();
    if (!model || !this.enabled) return;
    const visible = editor.getVisibleRanges();
    const first = (visible[0]?.startLineNumber ?? 1) - WIDGET_MARGIN_LINES;
    const last = (visible[visible.length - 1]?.endLineNumber ?? 1) + WIDGET_MARGIN_LINES;
    const lineHeight = editor.getOption(this.monaco.editor.EditorOption.lineHeight);

    const wanted = new Map<string, { c: InlineMathConstruct; rendered: Rendered; position: MonacoNs.IPosition }>();
    for (const item of this.inlineMath) {
      const position = model.getPositionAt(item.c.start);
      if (position.lineNumber < first || position.lineNumber > last) continue;
      wanted.set(`vm-math:${item.c.start}:${hashString(item.c.math)}`, { ...item, position });
    }

    this.widgets.forEach((w, id) => {
      if (!wanted.has(id)) {
        editor.removeContentWidget(w);
        this.widgets.delete(id);
      }
    });
    wanted.forEach(({ c, rendered, position }, id) => {
      const widgetPosition = {
        position,
        preference: [this.monaco.editor.ContentWidgetPositionPreference.EXACT],
        positionAffinity: this.monaco.editor.PositionAffinity.LeftOfInjectedText,
      };
      const existing = this.widgets.get(id);
      if (existing) {
        existing.setPosition(widgetPosition);
        editor.layoutContentWidget(existing);
        return;
      }
      const widget = new InlineMathWidget(id, widgetPosition, rendered.html, lineHeight, () => {
        editor.setPosition(model.getPositionAt(c.start + 1));
        editor.focus();
      });
      this.widgets.set(id, widget);
      editor.addContentWidget(widget);
    });
  }
}
