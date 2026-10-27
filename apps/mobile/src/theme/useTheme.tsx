import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { DEFAULT_THEME, findTheme, type Theme } from './theme';

const STORAGE_KEY = 'orgmate.theme';

interface ThemeContextValue {
  theme: Theme;
  setThemeId: (id: string) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  setThemeId: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(DEFAULT_THEME.id);

  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          setThemeIdState(findTheme(stored).id);
        }
      })
      .catch(() => undefined);
  }, []);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(findTheme(id).id);
    void SecureStore.setItemAsync(STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ theme: findTheme(themeId), setThemeId }),
    [themeId, setThemeId],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
