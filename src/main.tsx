import {createRoot} from 'react-dom/client';
import { RootRouter } from './RootRouter.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<RootRouter />);
