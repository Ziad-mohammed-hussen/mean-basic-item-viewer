export interface EnvironmentConfig {
  production: boolean;
  apiBaseUrl: string;
}

export const environment: EnvironmentConfig = {
  production: false,
  apiBaseUrl: 'http://localhost:3001/api',
};
