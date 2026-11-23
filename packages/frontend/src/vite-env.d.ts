/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which services use sample data in a non-production build: unset, "all", "none" or a comma list (services/demoData.ts). */
  readonly VITE_DEMO_DATA?: string;
  /** Local branding only (components/ui/brand.ts): the business's name, and its logo folder under /brand/. */
  readonly VITE_BRAND_NAME?: string;
  readonly VITE_BRAND_DIR?: string;
}
