import React from 'react';
import { createRoot } from 'react-dom/client';
import './css/base.css';
import './css/layout.css';
import './css/components.css';
import './css/map.css';
import App from './App';

createRoot(document.getElementById('root')!).render(<App />);
