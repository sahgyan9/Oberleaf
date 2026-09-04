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
      icon: <FileCode className="w-5 h-5 text-brand-mint" />,
    },
    {
      id: 'ieee',
      title: 'IEEE Conference Paper',
      desc: 'Two-column format conforming to IEEE transactions style.',
      icon: <FileText className="w-5 h-5 text-brand-cyan" />,
    },
    {
      id: 'thesis',
      title: "Master's / PhD Thesis",
      desc: 'Multi-chapter report format with table of contents & abstract.',
      icon: <GraduationCap className="w-5 h-5 text-amber-400" />,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightSubtle dark:border-surface-darkSubtle w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-semibold text-sm">
            <FolderPlus className="w-4 h-4 text-brand-mint" />
            <span>Create New Project</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              Project Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Quantum Computing Thesis"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:border-brand-mint outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
              Select Starter Template
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition ${
                    template === t.id
                      ? 'border-brand-mint bg-brand-mint/5 dark:bg-brand-mint/10'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="p-2 rounded-md bg-slate-100 dark:bg-slate-800">{t.icon}</div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-white">{t.title}</h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-md bg-brand-mint text-slate-950 hover:brightness-110 text-xs font-semibold shadow-md shadow-brand-mint/20 transition"
            >
              Create Project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
