'use client';

import { Provider } from 'react-redux';
import { Toaster } from 'sonner';
import { store } from '@/store';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      {children}
      <Toaster theme="dark" position="top-right" richColors />
    </Provider>
  );
}
