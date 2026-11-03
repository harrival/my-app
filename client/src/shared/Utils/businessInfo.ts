import axios from 'axios';
import { BASE_URL } from './apiConfig';

export interface BusinessInfo {
  business_guid?: string;
  business: string;
  user_guid?: string | null;
  business_name?: string;
  contact_email?: string;
  contact_phone?: string;
  country?: string;
  state?: string;
  city?: string;
  physical_address?: string;
  postal_code?: string;
  timezone?: string;
  currency?: string;
  summary?: string;
  is_active?: boolean;
  time_modified?: string;
  has_info?: boolean;
}

export const formatUserFriendlyBusinessName = (
  rawBusiness?: string | null,
  businessName?: string | null
): string => {
  const cleanName = (businessName || '').trim();
  const cleanSlug = (rawBusiness || '').trim();

  // If a descriptive business_name is present that isn't just the raw slug
  if (cleanName && cleanName.toLowerCase() !== cleanSlug.toLowerCase()) {
    return cleanName;
  }

  // Format slug by replacing underscores/hyphens with spaces and capitalizing words
  const source = cleanName || cleanSlug;
  if (!source) return 'Business';

  return source
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const CACHE_PREFIX = 'businessInfo:';
const CACHE_TTL_MS = 5 * 60 * 1000;

const cacheKey = (business: string) => `${CACHE_PREFIX}${business.toLowerCase()}`;

export const readCachedBusiness = (business?: string | null): BusinessInfo | null => {
  if (!business) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(business));
    if (!raw) return null;
    const { data, at } = JSON.parse(raw);
    if (Date.now() - at > CACHE_TTL_MS) return null;
    return data;
  } catch {
    return null;
  }
};

export const writeCachedBusiness = (info: BusinessInfo | null) => {
  if (!info?.business) return;
  try {
    sessionStorage.setItem(cacheKey(info.business), JSON.stringify({ data: info, at: Date.now() }));
  } catch {}
};

export const clearCachedBusiness = (business?: string | null) => {
  if (business) sessionStorage.removeItem(cacheKey(business));
};

/** Fetch business info from the backend (cached in sessionStorage for 5 minutes). */
export const fetchBusinessInfo = async (
  business?: string | null,
  userGuid?: string | null,
  force = false
): Promise<BusinessInfo | null> => {
  if (!force) {
    const cached = readCachedBusiness(business);
    if (cached) return cached;
  }
  let res;
  if (business) {
    res = await axios.get(`${BASE_URL}/api/business/${encodeURIComponent(business)}`, {
      params: userGuid ? { user_guid: userGuid } : undefined,
    });
  } else if (userGuid) {
    res = await axios.get(`${BASE_URL}/api/business/by-user/${encodeURIComponent(userGuid)}`);
  } else {
    return null;
  }
  const info: BusinessInfo | null = res.data?.business || null;
  writeCachedBusiness(info);
  return info;
};

export const saveBusinessInfo = async (
  currentBusiness: string,
  payload: Partial<BusinessInfo>,
  userGuid?: string | null
): Promise<BusinessInfo> => {
  const res = await axios.put(
    `${BASE_URL}/api/business/${encodeURIComponent(currentBusiness)}`,
    { ...payload, user_guid: payload.user_guid || userGuid || undefined }
  );
  const saved: BusinessInfo = res.data?.business;
  clearCachedBusiness(currentBusiness);
  writeCachedBusiness(saved);
  return saved;
};

