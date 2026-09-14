import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './components/forms.css';
import './components/extras.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
