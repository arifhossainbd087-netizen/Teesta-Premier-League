/**
 * Development-only Diagnostic Logger for TPL Season 2.
 * Safely tracks Firestore listener attachments, detachments, and query calls
 * without logging sensitive user credentials or private PII.
 */

interface ListenerRegistry {
  [listenerId: string]: {
    path: string;
    attachedAt: string;
    count: number;
  };
}

const activeListeners: ListenerRegistry = {};
let listenerCounter = 0;

export const diagnosticLogger = {
  /**
   * Log when a Firestore snapshot listener is mounted
   */
  listenerAttached(path: string): string {
    listenerCounter++;
    const id = `listener_${listenerCounter}_${path}`;
    activeListeners[id] = {
      path,
      attachedAt: new Date().toISOString(),
      count: 1,
    };

    if (import.meta.env.DEV) {
      console.log(
        `%c[TPL-DIAGNOSTIC] Listener ATTACHED: %c${path}%c | Total active: ${Object.keys(activeListeners).length}`,
        'color: #10b981; font-weight: bold;',
        'color: #38bdf8; font-weight: bold;',
        'color: #94a3b8;'
      );
    }
    return id;
  },

  /**
   * Log when a Firestore snapshot listener is detached (unmounted)
   */
  listenerDetached(id: string): void {
    if (activeListeners[id]) {
      const path = activeListeners[id].path;
      delete activeListeners[id];
      if (import.meta.env.DEV) {
        console.log(
          `%c[TPL-DIAGNOSTIC] Listener DETACHED: %c${path}%c | Total active: ${Object.keys(activeListeners).length}`,
          'color: #f59e0b; font-weight: bold;',
          'color: #38bdf8;',
          'color: #94a3b8;'
        );
      }
    }
  },

  /**
   * Log execution of a one-time getDoc or getDocs query
   */
  queryExecuted(path: string, type: 'getDoc' | 'getDocs' | 'transaction'): void {
    if (import.meta.env.DEV) {
      console.log(
        `%c[TPL-DIAGNOSTIC] Query EXECUTED (${type}): %c${path}`,
        'color: #8b5cf6; font-weight: bold;',
        'color: #38bdf8;'
      );
    }
  },

  /**
   * Get total active listeners
   */
  getActiveCount(): number {
    return Object.keys(activeListeners).length;
  },
};
