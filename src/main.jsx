import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ClaudeDriveSender from '../artifact/ClaudeDriveSender.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ClaudeDriveSender />
  </StrictMode>
);
