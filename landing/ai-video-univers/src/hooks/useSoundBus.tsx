import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * Un seul son actif sur toute la page.
 *
 * Chaque lecteur s'enregistre avec sa clé ; activer le son d'un lecteur remet
 * automatiquement tous les autres en sourdine.
 */
interface SoundBus {
  activeKey: string | null;
  isUnmuted: (key: string) => boolean;
  toggle: (key: string) => void;
  muteAll: () => void;
}

const SoundBusContext = createContext<SoundBus | null>(null);

export function SoundBusProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const isUnmuted = useCallback((key: string) => activeKey === key, [activeKey]);

  const toggle = useCallback((key: string) => {
    setActiveKey((current) => (current === key ? null : key));
  }, []);

  const muteAll = useCallback(() => setActiveKey(null), []);

  const value = useMemo<SoundBus>(
    () => ({ activeKey, isUnmuted, toggle, muteAll }),
    [activeKey, isUnmuted, toggle, muteAll],
  );

  return <SoundBusContext.Provider value={value}>{children}</SoundBusContext.Provider>;
}

export function useSoundBus(): SoundBus {
  const bus = useContext(SoundBusContext);
  if (!bus) {
    throw new Error('useSoundBus doit être utilisé à l’intérieur de <SoundBusProvider>.');
  }
  return bus;
}
