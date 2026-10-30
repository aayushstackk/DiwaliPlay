/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect } from 'react';

export type AdminTheme = 'light' | 'dark';

interface AdminThemeContextType {
  theme: AdminTheme;
  setTheme: (theme: AdminTheme) => void;
  toggleTheme: () => void;
  isLight: boolean;
}

const THEME_STORAGE_KEY = 'diwaliplay_admin_theme';

const AdminThemeContext = createContext<AdminThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  isLight: true
});

export const AdminThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<AdminTheme>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY) as AdminTheme | null;
        if (saved === 'dark' || saved === 'light') {
          return saved;
        }
      } catch (err) {
        console.warn('[AdminTheme] Failed to read from localStorage:', err);
      }
    }
    // Default to 'light' (Earthy Light Theme)
    return 'light';
  });

  const setTheme = (newTheme: AdminTheme) => {
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      } catch (err) {
        console.warn('[AdminTheme] Failed to save to localStorage:', err);
      }
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (err) {
        console.warn('[AdminTheme] Failed to sync localStorage:', err);
      }
    }
  }, [theme]);

  return (
    <AdminThemeContext.Provider value={{ theme, setTheme, toggleTheme, isLight: theme === 'light' }}>
      <div className={theme === 'light' ? 'admin-theme-light' : 'admin-theme-dark'}>
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
};

export const useAdminTheme = () => useContext(AdminThemeContext);

