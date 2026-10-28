/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import App from './App';
import { MobileRegistrationPage } from './components/MobileRegistrationPage';
import { TermsPage } from './components/TermsPage';
import { AdminApp } from './admin/AdminApp';

export const RootRouter: React.FC = () => {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '/';
  });

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Route matches: /admin or /admin/*
  if (currentPath === '/admin' || currentPath.startsWith('/admin')) {
    return <AdminApp />;
  }

  // Route matches: /terms or /terms/*
  if (currentPath === '/terms' || currentPath.startsWith('/terms')) {
    return <TermsPage />;
  }

  // Route matches: /register or /register/*
  if (currentPath === '/register' || currentPath.startsWith('/register')) {
    return <MobileRegistrationPage />;
  }

  // Default route: Main 65-inch Diwali Fun Play Game Kiosk
  return <App />;
};
