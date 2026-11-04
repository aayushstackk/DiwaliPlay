/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Suspense, lazy } from 'react';
import App from './App';

// Code-split secondary routes so the kiosk bundle doesn't ship the admin console
// (incl. exceljs), the mobile registration page or the terms page.
const AdminApp = lazy(() => import('./admin/AdminApp').then((m) => ({ default: m.AdminApp })));
const MobileRegistrationPage = lazy(() =>
  import('./components/MobileRegistrationPage').then((m) => ({ default: m.MobileRegistrationPage }))
);
const TermsPage = lazy(() => import('./components/TermsPage').then((m) => ({ default: m.TermsPage })));

const RouteFallback: React.FC = () => <div className="min-h-screen bg-neutral-950" />;

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
    return (
      <Suspense fallback={<RouteFallback />}>
        <AdminApp />
      </Suspense>
    );
  }

  // Route matches: /terms or /terms/*
  if (currentPath === '/terms' || currentPath.startsWith('/terms')) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <TermsPage />
      </Suspense>
    );
  }

  // Route matches: /register or /register/*
  if (currentPath === '/register' || currentPath.startsWith('/register')) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <MobileRegistrationPage />
      </Suspense>
    );
  }

  // Default route: Main 65-inch Diwali Fun Play Game Kiosk
  return <App />;
};
