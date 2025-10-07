import { useKV } from '@github/spark/hooks';
import { useEffect } from 'react';

type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useKV<Theme>('theme', 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    
    root.classList.remove('light', 'dark');
    if (theme) {
      root.classList.add(theme);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return {
    theme,
    setTheme,
    toggleTheme,
  };
}