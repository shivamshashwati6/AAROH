/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_ENABLE_SIMULATED_DATA_BADGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
