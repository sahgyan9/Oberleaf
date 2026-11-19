import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { sendDiagnosisFeedback, sendDiagnosisNote } from '../../utils/reporting';

interface DiagnosisFeedbackProps {
  projectId: string;
}

/**
 * "Diagnosis wrong or unclear? Report it" under the error cards. One click
 * sends which errors were shown and how Oberleaf explained them (no log, no
 * document text), so there is nothing to review first. Afterwards the user
 * may add one sentence on what was wrong.
 */
export const DiagnosisFeedback: React.FC<DiagnosisFeedbackProps> = ({ projectId }) => {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'noting' | 'noted' | 'error'>('idle');
  const [id, setId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const report = async () => {
    setState('sending');
    try {
      setId(await sendDiagnosisFeedback(projectId));
      setState('sent');
    } catch (e: any) {
      setError(e.message);
      setState('error');
    }
  };

  const addNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;
    setState('noting');
    try {
      await sendDiagnosisNote(id, note.trim());
      setState('noted');
    } catch (err: any) {
      setError(err.message);
      setState('error');
    }
  };

  const text = 'pt-0.5 text-[11px] text-stone-500 dark:text-stone-400';

  if (state === 'idle' || state === 'sending') {
    return (
      <div className={text}>
        Diagnosis wrong or unclear?{' '}
        <button
          type="button"
          onClick={() => void report()}
          disabled={state === 'sending'}
          className="underline underline-offset-2 hover:text-stone-800 dark:hover:text-stone-200 disabled:opacity-60"
        >
          Report it
        </button>
        {state === 'sending' && <Loader2 className="inline w-3 h-3 ml-1 animate-spin" />}
      </div>
    );
  }

  if (state === 'error') {
    return <div className={`${text} text-crimson dark:text-crimson-dark`}>{error}</div>;
  }

  if (state === 'noted') {
    return (
      <div className={`${text} flex items-center gap-1`}>
        <Check className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
        <span>Thanks, sent.</span>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void addNote(e)} className={`${text} space-y-1`}>
      <div className="flex items-center gap-1">
        <Check className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
        <span>Reported. What was wrong? (optional)</span>
      </div>
      <div className="flex gap-1.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          autoFocus
          placeholder="e.g. the real problem was on line 12"
          className="flex-1 min-w-0 rounded border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark px-2 py-1 text-[11px] text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-scholarly/40"
        />
        <button
          type="submit"
          disabled={!note.trim() || state === 'noting'}
          className="px-2 py-1 rounded font-medium border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle disabled:opacity-50"
        >
          {state === 'noting' ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send'}
        </button>
      </div>
    </form>
  );
};
