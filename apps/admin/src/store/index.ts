import { configureStore } from '@reduxjs/toolkit';
import { knowledgeApi } from './api';

export const store = configureStore({
  reducer: {
    [knowledgeApi.reducerPath]: knowledgeApi.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(knowledgeApi.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
