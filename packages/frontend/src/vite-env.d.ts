/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which services use sample data in a non-production build: unset, "all", "none" or a comma list (services/demoData.ts). */
  readonly VITE_DEMO_DATA?: string;
}
