import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { PaletteProvider } from './scene/palette.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PaletteProvider>
      <App />
    </PaletteProvider>
  </React.StrictMode>
);
