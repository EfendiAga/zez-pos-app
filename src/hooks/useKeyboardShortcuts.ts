import { useEffect } from 'react';

type KeyCombo = {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
};

export function useKeyboardShortcuts(
  shortcuts: { combo: KeyCombo; handler: (e: KeyboardEvent) => void; preventDefault?: boolean }[]
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA'
      ) {
        // Exception: we might want ESC or specific F-keys even inside inputs
        if (e.key !== 'Escape' && !e.key.startsWith('F')) {
          return;
        }
      }

      for (const { combo, handler, preventDefault = true } of shortcuts) {
        if (
          e.key.toLowerCase() === combo.key.toLowerCase() &&
          !!e.ctrlKey === !!combo.ctrl &&
          !!e.shiftKey === !!combo.shift &&
          !!e.altKey === !!combo.alt
        ) {
          if (preventDefault) {
            e.preventDefault();
          }
          handler(e);
          return; // Only execute first match
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
}
