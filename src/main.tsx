import { createRoot } from 'react-dom/client';
import { RootRouter } from './RootRouter.tsx';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import './index.css';
import { initLowEndMode } from './utils/device';

// Apply the `low-end` class on <html> before first paint so CSS drops heavy effects
initLowEndMode();

if (Capacitor.isNativePlatform()) {
  Camera.requestPermissions({ permissions: ['camera'] }).catch(console.error);
}

createRoot(document.getElementById('root')!).render(<RootRouter />);