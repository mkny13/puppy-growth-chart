import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import GrowthChart from './GrowthChart.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GrowthChart />
  </StrictMode>,
);
