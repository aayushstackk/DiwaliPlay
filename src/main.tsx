import { createRoot } from 'react-dom/client';
import { RootRouter } from './RootRouter.tsx';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import './index.css';

if (Capacitor.isNativePlatform()) {
  Camera.requestPermissions({ permissions: ['camera'] }).catch(console.error);
}

createRoot(document.getElementById('root')!).render(<RootRouter />);