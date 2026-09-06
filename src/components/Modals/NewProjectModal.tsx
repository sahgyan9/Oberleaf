import React, { useState } from 'react';
import { X, FolderPlus, FileCode, GraduationCap, FileText } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, template: string) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
}) => {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('blank');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), template);
    setName('');
    onClose();
  };

  const templates = [
    {
      id: 'blank',
      title: 'Blank Document',
      desc: 'Clean article class with essential math packages.',
      icon: <FileCode className="w-5 h-5 text-scholarly dark:text-scholarly-dark" />,
    },
    {
      id: 'ieee',
      title: 'IEEE Conference Paper',
      desc: 'Two-column format conforming to IEEE transactions style.',
      icon: <FileText className="w-5 h-5 text-citation dark:text-citation-dark" />,
    },
    {
      id: 'thesis',
      title: "Master's / PhD Thesis",
      desc: 'Multi-chapter report format with table of contents & abstract.',
      icon: <GraduationCap className="w-5 h-5 text-diagnostic dark:text-diagnostic-dark" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none font-sans">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3">
          <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-serif font-semibold text-base">
            <FolderPlus className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
            <span>Create New Project</span>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Quantum Computing Thesis"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCapitalize="words"
              spellCheck={false}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-lg p-2.5 text-sm text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-sans"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-2">
              Select Starter Template
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition btn-tactile ${
                    template === t.id
                      ? 'border-scholarly dark:border-scholarly-dark bg-scholarly-subtle/40 dark:bg-scholarly-darkSubtle/40'
                      : 'border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
                  }`}
                >
                  <div className="p-2 rounded-md bg-stone-100 dark:bg-stone-800">{t.icon}</div>
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 font-sans">{t.title}</h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5 font-sans">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium transition btn-tactile"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white text-xs font-medium shadow-xs transition btn-tactile"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
