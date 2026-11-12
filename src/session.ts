/**
 * SessionCleanupService — Sentry keeps original files, detections and the
 * temporary placeholder mapping in memory for the active session only.
 * Ending the session revokes every media URL and clears the state; nothing
 * sensitive is written to persistent browser storage.
 */

export type SessionDocumentMedia = {
  originalUrl: string;
  sanitisedUrl?: string;
};

export const LEGACY_STORAGE_KEY = 'sentry-session';

export const END_SESSION_PROMPT =
  'Everything in this tab lives in memory only. Ending the session clears it immediately — nothing is kept in browser storage, and this cannot be undone. Download anything you need first.';

/** Revokes every object URL created for this session's documents. */
export function revokeSessionMedia(documents: SessionDocumentMedia[]) {
  for (const document of documents) {
    URL.revokeObjectURL(document.originalUrl);
    if (document.sanitisedUrl) {
      URL.revokeObjectURL(document.sanitisedUrl);
    }
  }
}

/**
 * Removes any session data a previous version of Sentry may have persisted
 * in localStorage. Returns false when browser storage is unavailable.
 */
export function purgeLegacySessionStorage(): boolean {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
