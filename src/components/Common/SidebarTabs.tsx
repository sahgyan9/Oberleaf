import React from 'react';

interface SidebarTabsProps {
  activeTab: 'files' | 'outline';
  onTabChange: (tab: 'files' | 'outline') => void;
}

/** The Files / Outline switch shared by both sidebar panels. */
export const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabChange }) => (
  <div role="tablist" aria-label="Sidebar" className="flex items-center bg-stone-200/60 dark:bg-stone-800 rounded-md p-0.5 text-xs">
    {(['files', 'outline'] as const).map((tab) => (
      <button
        key={tab}
        type="button"
        role="tab"
        aria-selected={activeTab === tab}
        onClick={() => onTabChange(tab)}
        className={`px-2 py-0.5 rounded font-medium transition whitespace-nowrap ${
          activeTab === tab
            ? 'bg-white dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-sm'
            : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
        }`}
      >
        {tab === 'files' ? 'Files' : 'Outline'}
      </button>
    ))}
  </div>
);
