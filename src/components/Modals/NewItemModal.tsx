import React, { useState, useEffect, useRef } from "react";
import { FilePlus, FolderPlus, X } from "lucide-react";

interface NewItemModalProps {
  isOpen: boolean;
  mode: "file" | "folder";
  parentFolder?: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({
  isOpen,
  mode,
  parentFolder,
  onConfirm,
  onClose,
}) => {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const placeholder =
    mode === "file" ? "e.g. chapter1.tex, references.bib" : "e.g. sections, figures";
  const Icon = mode === "file" ? FilePlus : FolderPlus;
  const title = mode === "file" ? "New File" : "New Folder";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name cannot be empty.");
      return;
    }
    if (trimmed.includes("/") || trimmed.includes("\\")) {
      setError("Name cannot contain slashes. Use the parent folder field instead.");
      return;
    }
    onConfirm(trimmed);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl w-96 max-w-[90vw] p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
            <h2 className="font-serif font-semibold text-base text-[#1C1917] dark:text-[#F5F5F4]">
              {title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {parentFolder && (
          <p className="text-xs text-stone-500 dark:text-stone-400 font-mono truncate">
            Location: {parentFolder}/
          </p>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <input
              ref={inputRef}
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              placeholder={placeholder}
              className={`w-full px-3 py-2 rounded-lg text-sm font-mono
                bg-surface-lightSubtle dark:bg-surface-darkSubtle
                border ${error ? "border-crimson dark:border-crimson-dark" : "border-surface-lightBorder dark:border-surface-darkBorder"}
                text-[#1C1917] dark:text-[#F5F5F4] placeholder-stone-400 dark:placeholder-stone-600
                focus:outline-none focus:ring-2 focus:ring-scholarly/40 dark:focus:ring-scholarly-dark/40 transition`}
            />
            {error && (
              <p className="mt-1 text-xs text-crimson dark:text-crimson-dark">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-sm font-medium
                bg-surface-lightSubtle dark:bg-surface-darkSubtle
                hover:bg-stone-200 dark:hover:bg-stone-800
                border border-surface-lightBorder dark:border-surface-darkBorder
                text-stone-700 dark:text-stone-300 transition btn-tactile"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg text-sm font-semibold
                bg-scholarly dark:bg-scholarly-dark
                hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover
                text-white transition shadow-sm btn-tactile"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
