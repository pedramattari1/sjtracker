/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CITY_REPORT_RECIPIENTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
