import React, { useState, useMemo } from 'react';
import {
  ListTree,
  ChevronRight,
  ChevronDown,
  GripVertical,
  PanelLeftClose,
  FileText,
} from 'lucide-react';
import {
  parseLatexOutline,
  SectionNode,
} from '../../utils/latexOutline';

interface OutlinePanelProps {
  content: string;
  onJumpToLine: (lineNumber: number) => void;
  onReorderSection: (
    sourceId: string,
    targetId: string,
    position: 'before' | 'after'
  ) => void;
  onToggleCollapse?: () => void;
  activeTab?: 'files' | 'outline';
  onTabChange?: (tab: 'files' | 'outline') => void;
}

interface DragTargetState {
  id: string;
  position: 'before' | 'after';
}

export const OutlinePanel: React.FC<OutlinePanelProps> = ({
  content,
  onJumpToLine,
  onReorderSection,
  onToggleCollapse,
  activeTab = 'outline',
  onTabChange,
}) => {
  const [collapsedNodes, setCollapsedNodes] = useState<Record<string, boolean>>({});
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<DragTargetState | null>(null);

  // Parse sections efficiently whenever document content changes
  const { tree, flat } = useMemo(() => {
    return parseLatexOutline(content);
  }, [content]);

  // Toggle folding for nodes with children
  const toggleNodeFold = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Drag-and-drop event handlers
  const handleDragStart = (e: React.DragEvent, node: SectionNode) => {
    setDraggedNodeId(node.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.setData('application/x-oberleaf-section', node.id);
  };

  const handleDragEnd = () => {
    setDraggedNodeId(null);
    setDragOverTarget(null);
  };

  const handleDragOver = (e: React.DragEvent, node: SectionNode) => {
    if (!draggedNodeId || draggedNodeId === node.id) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    // Calculate whether mouse is in top half or bottom half of the element
    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';

    if (
      !dragOverTarget ||
      dragOverTarget.id !== node.id ||
      dragOverTarget.position !== position
    ) {
      setDragOverTarget({ id: node.id, position });
    }
  };

  const handleDragLeave = (e: React.DragEvent, node: SectionNode) => {
    // Only clear if actually leaving the current element
    if (dragOverTarget?.id === node.id) {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !e.currentTarget.contains(related)) {
        setDragOverTarget(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent, targetNode: SectionNode) => {
    e.preventDefault();
    e.stopPropagation();

    const sourceId =
      draggedNodeId || e.dataTransfer.getData('application/x-oberleaf-section');
    const targetId = targetNode.id;
    const position = dragOverTarget?.position || 'after';

    setDraggedNodeId(null);
    setDragOverTarget(null);

    if (!sourceId || sourceId === targetId) return;

    onReorderSection(sourceId, targetId, position);
  };

  // Check if a node is an ancestor/parent of the currently dragged node
  const isDescendantOfDragged = (node: SectionNode): boolean => {
    if (!draggedNodeId) return false;
    let current = flat.find((n) => n.id === node.id);
    while (current && current.parentId) {
      if (current.parentId === draggedNodeId) return true;
      current = flat.find((n) => n.id === current?.parentId);
    }
    return false;
  };

  const renderSectionItem = (node: SectionNode, depth = 0) => {
    const isDragged = draggedNodeId === node.id;
    const isDropTarget = dragOverTarget?.id === node.id;
    const dropPos = isDropTarget ? dragOverTarget.position : null;
    const hasChildren = node.children.length > 0;
    const isFolded = !!collapsedNodes[node.id];
    const isChildOfDragged = isDescendantOfDragged(node);

    // Section level label / abbreviation
    const levelLabel =
      node.level === 0
        ? 'part'
        : node.level === 1
        ? 'ch'
        : node.level === 2
        ? 'sec'
        : node.level === 3
        ? 'sub'
        : node.level === 4
        ? 'sub2'
        : 'par';

    return (
      <div key={node.id} className="select-none">
        <div
          draggable={!isChildOfDragged}
          onDragStart={(e) => handleDragStart(e, node)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, node)}
          onDragLeave={(e) => handleDragLeave(e, node)}
          onDrop={(e) => handleDrop(e, node)}
          onClick={() => onJumpToLine(node.startLine)}
          title={`Line ${node.startLine} to ${node.endLine} (Click to jump, drag to reorder)`}
          className={`group flex items-center py-1 px-1.5 rounded cursor-pointer transition-all relative text-xs ${
            isDragged
              ? 'opacity-40 bg-stone-200/50 dark:bg-stone-800/50'
              : 'hover:bg-stone-200/70 dark:hover:bg-stone-800/70'
          } ${
            dropPos === 'before'
              ? 'border-t-2 border-scholarly dark:border-scholarly-dark -mt-[2px]'
              : ''
          } ${
            dropPos === 'after'
              ? 'border-b-2 border-scholarly dark:border-scholarly-dark -mb-[2px]'
              : ''
          }`}
          style={{ paddingLeft: `${Math.max(4, depth * 14 + 4)}px` }}
        >
          {/* Drag Handle */}
          <div
            className="text-stone-300 dark:text-stone-600 group-hover:text-stone-500 dark:group-hover:text-stone-400 cursor-grab active:cursor-grabbing p-0.5 -ml-1 mr-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Drag to reorder section"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </div>

          {/* Fold / Unfold Chevron */}
          {hasChildren ? (
            <button
              onClick={(e) => toggleNodeFold(node.id, e)}
              className="p-0.5 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 mr-1"
            >
              {isFolded ? (
                <ChevronRight className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          ) : (
            <div className="w-4 h-4 mr-1 flex-shrink-0 flex items-center justify-center">
              <span className="w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-600" />
            </div>
          )}

          {/* Level Badge */}
          <span
            className={`font-mono text-[9px] px-1 py-0.2 rounded mr-1.5 flex-shrink-0 uppercase ${
              node.level <= 2
                ? 'bg-scholarly/10 dark:bg-scholarly-dark/15 text-scholarly dark:text-scholarly-dark font-medium'
                : 'bg-stone-200/60 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
            }`}
          >
            {levelLabel}
            {node.isStarred ? '*' : ''}
          </span>

          {/* Section Title */}
          <span className="truncate flex-1 font-sans text-stone-800 dark:text-stone-200 font-normal group-hover:text-stone-900 dark:group-hover:text-stone-100">
            {node.title}
          </span>

          {/* Line number badge */}
          <span className="text-[10px] font-mono text-stone-400 dark:text-stone-500 opacity-0 group-hover:opacity-100 ml-1.5 flex-shrink-0">
            L{node.startLine}
          </span>
        </div>

        {/* Render child subsections */}
        {hasChildren && !isFolded && (
          <div className="space-y-0.5">
            {node.children.map((child) => renderSectionItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="h-full w-full bg-surface-lightPanel dark:bg-surface-darkPanel flex flex-col select-none relative transition-colors">
      {/* Outline Header */}
      <div className="p-3 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between flex-shrink-0">
        {onTabChange ? (
          <div className="flex items-center space-x-2">
            <div className="flex items-center bg-stone-200/60 dark:bg-stone-800 rounded-md p-0.5 text-xs">
              <button
                onClick={() => onTabChange('files')}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  activeTab === 'files'
                    ? 'bg-white dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                Files
              </button>
              <button
                onClick={() => onTabChange('outline')}
                className={`px-2 py-0.5 rounded font-medium transition ${
                  activeTab === 'outline'
                    ? 'bg-white dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-sm'
                    : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                Outline
              </button>
            </div>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">
              ({flat.length})
            </span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5">
            <ListTree className="w-3.5 h-3.5 text-stone-400 dark:text-stone-500" />
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400 font-sans">
              Outline
            </span>
            <span className="text-[10px] text-stone-400 dark:text-stone-500 font-mono">
              ({flat.length})
            </span>
          </div>
        )}

        <div className="flex items-center space-x-1">
          {onToggleCollapse && (
            <button
              aria-label="Collapse Sidebar (Ctrl+B)"
              onClick={onToggleCollapse}
              title="Collapse Sidebar (Ctrl+B)"
              className="p-1 rounded hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition btn-tactile"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Section List / Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {flat.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-400 dark:text-stone-500 flex flex-col items-center justify-center space-y-2">
            <FileText className="w-6 h-6 text-stone-300 dark:text-stone-600 mb-1" />
            <p className="font-medium text-stone-600 dark:text-stone-300">
              No sections detected
            </p>
            <p className="text-[11px] max-w-[180px] leading-relaxed">
              Add headings like <code className="text-scholarly dark:text-scholarly-dark">\section&#123;...&#125;</code> to view and reorder sections.
            </p>
          </div>
        ) : (
          tree.map((node) => renderSectionItem(node, 0))
        )}
      </div>

      {/* Reorder instructions footer */}
      {flat.length > 0 && (
        <div className="p-2 border-t border-surface-lightBorder dark:border-surface-darkBorder text-[10.5px] text-center text-stone-400 dark:text-stone-500 flex-shrink-0">
          Drag sections to reorder document
        </div>
      )}
    </aside>
  );
};
