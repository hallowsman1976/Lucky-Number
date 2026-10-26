const dateTime = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  dateStyle: 'medium',
  timeStyle: 'medium',
});

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTime.format(new Date(iso)) : '';
}

export interface SiteUrls {
  register: string;
  admin: string;
  display: string;
}

/** base = VITE_PUBLIC_SITE_URL หรือ origin ของหน้าที่เปิดอยู่ */
export function siteUrls(base: string): SiteUrls {
  const root = base.endsWith('/') ? base : base + '/';
  return {
    register: root,
    admin: new URL('admin.html', root).href,
    display: new URL('display.html', root).href,
  };
}

export function currentSiteUrls(): SiteUrls {
  return siteUrls(import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin);
}
