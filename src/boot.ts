// Bridge to the startup screen defined inline in index.html. The screen is
// plain HTML so it paints before any JavaScript bundle arrives; the app reports
// real progress through these calls, and the screen removes itself once every
// step it shows is done.

export type BootStepId = 'app' | 'projects' | 'project';
export type BootStepState = 'active' | 'done' | 'error';

interface BootScreenApi {
  step(id: BootStepId, state: BootStepState, message?: string): void;
  finish(): void;
}

declare global {
  interface Window {
    __oberleafBoot?: BootScreenApi;
  }
}

export function bootStep(id: BootStepId, state: BootStepState, message?: string): void {
  window.__oberleafBoot?.step(id, state, message);
}

export function finishBoot(): void {
  window.__oberleafBoot?.finish();
}
