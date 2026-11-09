import React, { useRef, useState } from 'react';
import { X, FolderPlus, FileCode, GraduationCap, FileText, FileArchive, Upload } from 'lucide-react';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, template: string) => void;
  /** Resolves true when the import succeeded and the modal can close. */
  onImport: (name: string, file: File) => Promise<boolean>;
}

const projectNameFromZip = (fileName: string) =>
  fileName
    .replace(/\.zip$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onImport,
}) => {
  const [name, setName] = useState('');
  const [template, setTemplate] = useState('cv');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const reset = () => {
    setName('');
    setZipFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isImporting) return;
    if (zipFile) {
      setIsImporting(true);
      try {
        if (await onImport(name.trim(), zipFile)) {
          reset();
          onClose();
        }
      } finally {
        setIsImporting(false);
      }
      return;
    }
    onCreate(name.trim(), template);
    reset();
    onClose();
  };

  const handleZipChosen = (file: File | undefined) => {
    if (!file) return;
    setZipFile(file);
    if (!name.trim()) setName(projectNameFromZip(file.name));
  };

  const templates = [
    {
      id: 'cv',
      title: 'Curriculum Vitae / Resume (Default)',
      desc: 'Clean, modern single-page ATS-friendly CV with education, experience, and skills.',
      icon: <FileText className="w-5 h-5 text-scholarly-green dark:text-scholarly-greenDark" />,
    },
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
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
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
              placeholder="e.g. My CV or Research Paper"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoCapitalize="words"
              spellCheck={false}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-lg p-2.5 text-sm text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-sans"
              autoFocus
            />
          </div>

          <div className={zipFile ? 'opacity-50 pointer-events-none' : ''} aria-disabled={!!zipFile}>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-2">
              Select Starter Template
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setTemplate(t.id)}
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition btn-tactile ${
                    template === t.id && !zipFile
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

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-stone-400 mb-2">
              Or Import an Existing Project
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => handleZipChosen(e.target.files?.[0])}
            />
            {zipFile ? (
              <div className="flex items-center justify-between p-3 rounded-lg border border-scholarly dark:border-scholarly-dark bg-scholarly-subtle/40 dark:bg-scholarly-darkSubtle/40">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="p-2 rounded-md bg-stone-100 dark:bg-stone-800">
                    <FileArchive className="w-5 h-5 text-scholarly dark:text-scholarly-dark" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{zipFile.name}</h4>
                    <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                      {zipFile.size < 1024 * 1024
                        ? `${Math.max(1, Math.round(zipFile.size / 1024))} KB`
                        : `${(zipFile.size / (1024 * 1024)).toFixed(1)} MB`}
                      . Every file in the zip is imported.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setZipFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile"
                  aria-label="Remove zip"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-start space-x-3 p-3 rounded-lg border border-dashed border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition btn-tactile"
              >
                <div className="p-2 rounded-md bg-stone-100 dark:bg-stone-800">
                  <Upload className="w-5 h-5 text-stone-600 dark:text-stone-300" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100">Import .zip</h4>
                  <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    Brings the class, bibliography and figure files along with the document. From Overleaf: Menu, Download, Source.
                  </p>
                </div>
              </button>
            )}
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
              disabled={isImporting}
              className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white text-xs font-medium shadow-xs transition btn-tactile disabled:opacity-60"
            >
              {zipFile ? (isImporting ? 'Importing...' : 'Import Project') : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
