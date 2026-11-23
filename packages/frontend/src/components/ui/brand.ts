/**
 * Local branding: a business's own logo, from this machine's start-up settings only (VITE_BRAND_NAME and
 * VITE_BRAND_DIR, e.g. /brand/local). The logo files are never in the repository (public/brand/local/ is
 * gitignored); without the settings, or without the files, the app keeps its plain name.
 */
export interface Brand {
  name: string;
  logo: string;
  mark: string;
  icon: string;
  touchIcon: string;
  /** The logo without its tagline, for small spaces such as the phone header. */
  wordmark: string;
}

export function readBrand(env: { VITE_BRAND_NAME?: string; VITE_BRAND_DIR?: string }): Brand | null {
  const name = env.VITE_BRAND_NAME?.trim();
  const dir = env.VITE_BRAND_DIR?.trim().replace(/\/+$/, '');
  // Only the app's own /brand/ folder: never another site, never a step out of the folder.
  if (!name || !dir || !/^\/brand\/[\w-]+(\/[\w-]+)*$/.test(dir)) return null;
  return {
    name,
    logo: `${dir}/logo.png`,
    mark: `${dir}/mark.png`,
    icon: `${dir}/icon.png`,
    touchIcon: `${dir}/icon-180.png`,
    wordmark: `${dir}/wordmark.png`,
  };
}

/** The brand of this build: none unless the local settings name one. */
export const BRAND = readBrand(import.meta.env);

/** Puts the brand on the browser tab and the phone home screen. Without a brand, nothing changes. */
export function applyBrandIcon(brand: Brand | null, doc: Document): void {
  if (!brand) return;
  const link = (rel: string, href: string) => {
    const element = doc.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`) ?? doc.createElement('link');
    element.rel = rel;
    element.href = href;
    doc.head.appendChild(element);
  };
  link('icon', brand.icon);
  link('apple-touch-icon', brand.touchIcon);
  doc.title = brand.name;
}
