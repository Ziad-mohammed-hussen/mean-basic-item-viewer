export interface EnvironmentConfig {
  production: boolean;
  apiBaseUrl: string;
}

const runtimeApiBaseUrl =
  typeof globalThis !== 'undefined' &&
  typeof (globalThis as Record<string, unknown>)['__API_BASE_URL__'] === 'string'
    ? ((globalThis as Record<string, unknown>)['__API_BASE_URL__'] as string)
    : '/api';

export const environment: EnvironmentConfig = {
  production: true,
  apiBaseUrl: runtimeApiBaseUrl,
};
