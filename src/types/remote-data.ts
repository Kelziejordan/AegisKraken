export type RemoteData<T> =
  | { type: 'idle' }
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; message: string };

export const RemoteData = {
  idle: <T>(): RemoteData<T> => ({ type: 'idle' }),
  loading: <T>(): RemoteData<T> => ({ type: 'loading' }),
  success: <T>(data: T): RemoteData<T> => ({ type: 'success', data }),
  error: <T>(error: Error | string): RemoteData<T> => ({
    type: 'error',
    message: error instanceof Error ? error.message : error,
  }),
};
