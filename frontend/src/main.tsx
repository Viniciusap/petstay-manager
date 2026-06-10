import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import SystemApp from './pages/SystemApp';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

const segments = window.location.pathname.split('/').filter(Boolean);
const firstSeg = segments[0] ?? '';
const isSystem = firstSeg === 'system';
const basename = firstSeg ? '/' + firstSeg : '/';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {isSystem ? (
        <SystemApp />
      ) : (
        <App basename={basename} />
      )}
      <Toaster richColors closeButton />
    </QueryClientProvider>
  </React.StrictMode>
);
