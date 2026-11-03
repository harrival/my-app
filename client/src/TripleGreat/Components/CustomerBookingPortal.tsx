import React, { useEffect, useState, useCallback, useRef, useContext } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import axios from 'axios';
import { BASE_URL } from '../../shared/Utils/apiConfig';
import { AuthContext } from '../../shared/Context/auth-context';
import { useUserProfile } from '../../shared/Context/UserProfileContext';
import PasswordInput from '../../shared/Authenticate/PasswordInput';
import PasswordStrengthChecklist from '../../shared/Authenticate/PasswordStrengthChecklist';
import { evaluatePasswordStrength } from '../../shared/Utils/passwordValidation';
import { useTenant } from './TenantContext';
import classes from '../ComponentStyles/TripleGreat.module.scss';

export interface CatalogItem {
  item_guid: string;
  business: string;
  name: string;
  description: string;
  daily_rate_cents: number;
  images: string[];
  is_active: boolean;
  active_units_count?: number;
}

export const getFallbackPhotoForName = (name: string): string => {
  const cleanName = (name || 'Rental Item')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const displayTitle = cleanName.length > 36 ? cleanName.slice(0, 34) + '...' : cleanName;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">
    <defs>
      <linearGradient id="invGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#e8f4e5;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#d4e9d0;stop-opacity:1" />
      </linearGradient>
    </defs>
    <rect width="600" height="400" fill="url(#invGrad)" rx="10" />
    <rect x="12" y="12" width="576" height="376" fill="none" stroke="#b4d7ad" stroke-width="3" stroke-dasharray="8,6" rx="8" />
    <g fill="#174b0f" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
      <text x="300" y="165" font-size="56">📦</text>
      <text x="300" y="225" font-size="24" font-weight="700">${displayTitle}</text>
      <text x="300" y="260" font-size="14" fill="#356b2e" font-weight="600" letter-spacing="1">RENTAL ITEM</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

/**
 * Formats image URLs into direct embeddable links.
 * Converts Google Drive sharing/view links:
 * - https://drive.google.com/file/d/{id}/view?usp=drive_link
 * - https://drive.google.com/open?id={id}
 * - https://drive.google.com/uc?id={id}
 * into direct CDN image URLs:
 * - https://lh3.googleusercontent.com/d/{id}
 */
export const formatImageUrl = (url?: string | null): string => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  // Match /d/<ID> in Google Drive URLs (drive.google.com/file/d/<ID>, docs.google.com/..., etc.)
  const dMatch = trimmed.match(/(?:drive|docs)\.google\.com\/(?:[^\s]*\/)?d\/([a-zA-Z0-9_-]+)/i);
  if (dMatch && dMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${dMatch[1]}`;
  }

  // Match ?id=<ID> or &id=<ID> in Google Drive URLs
  const idMatch = trimmed.match(/(?:drive|docs)\.google\.com\/[^\s]*[?&]id=([a-zA-Z0-9_-]+)/i);
  if (idMatch && idMatch[1]) {
    return `https://lh3.googleusercontent.com/d/${idMatch[1]}`;
  }

  return trimmed;
};

export const getItemPhoto = (item?: { name?: string; images?: string[] } | null): string => {
  if (item && Array.isArray(item.images) && item.images.length > 0 && item.images[0]) {
    return formatImageUrl(item.images[0]);
  }
  return getFallbackPhotoForName(item?.name || 'Rental Item');
};

const CustomerBookingPortal: React.FC = () => {
  const { business: paramBusiness } = useParams<{ business: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useContext(AuthContext);
  const { profile, setProfile, refreshProfile } = useUserProfile();
  const {
    tenantBusiness,
    tenantConfig,
    loadingConfig,
    isSupervisorForActiveTenant,
    refreshTenantConfig,
  } = useTenant();

  const activeBusiness = paramBusiness || tenantBusiness || profile?.business || 'alpha_rentals';

  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loadingItems, setLoadingItems] = useState<boolean>(false);

  // Customer contact details
  const [customerForm, setCustomerForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone_number: '',
    sms_opt_in: false,
  });

  // Booking recipient mode for logged-in users: booking for self vs booking for others
  const [bookingForOthers, setBookingForOthers] = useState<boolean>(false);
  const [createAccountForOther, setCreateAccountForOther] = useState<boolean>(false);
  const [otherPassword, setOtherPassword] = useState<string>('');

  // Automatically pre-populate customer contact details if already signed in and booking for self
  useEffect(() => {
    if (profile && !bookingForOthers) {
      setCustomerForm((prev) => ({
        ...prev,
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        email: profile.email || '',
        phone_number: profile.phone_number || '',
      }));
    }
  }, [profile, bookingForOthers]);

  // Checkout authentication mode: 'guest' | 'create_account' | 'sign_in'
  const [checkoutMode, setCheckoutMode] = useState<'guest' | 'create_account' | 'sign_in'>('guest');
  const [showAuthChoiceModal, setShowAuthChoiceModal] = useState<boolean>(false);
  const [modalView, setModalView] = useState<'choice' | 'create_account' | 'sign_in'>('choice');

  // Create Account State
  const [createPassword, setCreatePassword] = useState<string>('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState<string>('');
  const [createAccountError, setCreateAccountError] = useState<string>('');
  const [isCreatingAccount, setIsCreatingAccount] = useState<boolean>(false);

  // Sign In State
  const [signInIdentifier, setSignInIdentifier] = useState<string>('');
  const [signInPassword, setSignInPassword] = useState<string>('');
  const [signInError, setSignInError] = useState<string>('');
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  const [lastConfirmedCheckout, setLastConfirmedCheckout] = useState<any | null>(null);
  // Reservation & Booking state
  const [selectedItemGuid, setSelectedItemGuid] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const endDateInputRef = useRef<HTMLInputElement>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [availabilityResult, setAvailabilityResult] = useState<any | null>(null);
  const [activeHold, setActiveHold] = useState<any | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState<number>(0);
  const [engineStatus, setEngineStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Multi-image gallery and magnification state
  const [activeImageIndexByItem, setActiveImageIndexByItem] = useState<Record<string, number>>({});
  const [magnifiedImage, setMagnifiedImage] = useState<{
    item: CatalogItem;
    index: number;
  } | null>(null);

  // Close magnification on Escape, or cycle photos with Left/Right arrow keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!magnifiedImage) return;
      if (e.key === 'Escape') {
        setMagnifiedImage(null);
      } else if (e.key === 'ArrowRight') {
        const total =
          Array.isArray(magnifiedImage.item.images) && magnifiedImage.item.images.length > 0
            ? magnifiedImage.item.images.length
            : 1;
        setMagnifiedImage((prev) => (prev ? { ...prev, index: (prev.index + 1) % total } : null));
      } else if (e.key === 'ArrowLeft') {
        const total =
          Array.isArray(magnifiedImage.item.images) && magnifiedImage.item.images.length > 0
            ? magnifiedImage.item.images.length
            : 1;
        setMagnifiedImage((prev) =>
          prev ? { ...prev, index: (prev.index - 1 + total) % total } : null
        );
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [magnifiedImage]);

  const getItemImageIndex = (itemGuid: string, total: number) => {
    const idx = activeImageIndexByItem[itemGuid] || 0;
    if (idx >= total) return 0;
    return idx;
  };

  const handleNextImage = (itemGuid: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndexByItem((prev) => ({
      ...prev,
      [itemGuid]: ((prev[itemGuid] || 0) + 1) % total,
    }));
  };

  const handlePrevImage = (itemGuid: string, total: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveImageIndexByItem((prev) => ({
      ...prev,
      [itemGuid]: ((prev[itemGuid] || 0) - 1 + total) % total,
    }));
  };

  const bookingFormRef = useRef<HTMLDivElement>(null);

  const handleSelectItem = (itemGuid: string) => {
    setSelectedItemGuid(itemGuid);
    setEngineStatus(null);
    if (bookingFormRef.current) {
      bookingFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        const dateInput = document.getElementById('res-start-date');
        if (dateInput) {
          dateInput.focus();
        }
      }, 350);
    }
  };

  const selectedItem = items.find((it) => it.item_guid === selectedItemGuid);

  const loadTenantItems = useCallback(
    async (biz: string) => {
      if (!biz) return;
      setLoadingItems(true);
      try {
        const res = await axios.get<CatalogItem[]>(
          `${BASE_URL}/api/${encodeURIComponent(biz)}/items`
        );
        const list = Array.isArray(res.data) ? res.data : [];
        setItems(list);
      } catch (err) {
        console.error('Error loading catalog items:', err);
        setItems([]);
      } finally {
        setLoadingItems(false);
      }
    },
    []
  );

  useEffect(() => {
    refreshTenantConfig(activeBusiness);
    loadTenantItems(activeBusiness);
  }, [activeBusiness, refreshTenantConfig, loadTenantItems]);

  // Old ?manage_token=... links now open the dedicated Manage Reservation page
  useEffect(() => {
    const urlToken = new URLSearchParams(location.search).get('manage_token');
    if (urlToken) {
      navigate(
        `/book/${encodeURIComponent(activeBusiness)}/manage?manage_token=${encodeURIComponent(urlToken)}`,
        { replace: true }
      );
    }
  }, [location.search, activeBusiness, navigate]);

  // Countdown timer for active checkout hold
  useEffect(() => {
    if (!activeHold?.hold_expires_at) {
      setHoldSecondsLeft(0);
      return;
    }
    const updateRemaining = () => {
      const diff = Math.max(
        0,
        Math.round((new Date(activeHold.hold_expires_at).getTime() - Date.now()) / 1000)
      );
      setHoldSecondsLeft(diff);
      if (diff <= 0) {
        setActiveHold(null);
        loadTenantItems(activeBusiness);
      }
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 1000);
    return () => clearInterval(timer);
  }, [activeHold, activeBusiness, loadTenantItems]);

  const formatMoney = (cents: number, currency = tenantConfig?.currency || 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format((cents || 0) / 100);
  };

  // Changing item or dates requires re-checking before contact details are shown
  useEffect(() => {
    if (!activeHold) setAvailabilityResult(null);
  }, [selectedItemGuid, startDate, endDate, activeHold]);

  const handleCheckAvailability = async () => {
    const errors: Record<string, string> = {};
    if (!selectedItemGuid) {
      errors.item_guid = 'Please select a rental item.';
    }
    if (!startDate) {
      errors.start_date = 'Please select a start date.';
    }
    if (!endDate) {
      errors.end_date = 'Please select an end date.';
    } else if (startDate && (new Date(startDate) > new Date(endDate) || startDate > endDate)) {
      errors.end_date = 'Return date cannot be earlier than pick-up date';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...errors }));
      return;
    }
    setFormErrors(prev => ({ ...prev, item_guid: '', start_date: '', end_date: '' }));
    setEngineStatus(null);
    try {
      const res = await axios.get(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/items/${encodeURIComponent(
          selectedItemGuid
        )}/availability`,
        { params: { start_date: startDate, end_date: endDate } }
      );
      setAvailabilityResult(res.data);
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Unable to check availability for the selected dates.',
      });
    }
  };

  const handleCreateHold = async () => {
    const errors: Record<string, string> = {};
    if (!selectedItemGuid) {
      errors.item_guid = 'Please select a rental item.';
    }
    if (!startDate) {
      errors.start_date = 'Please select a start date.';
    }
    if (!endDate) {
      errors.end_date = 'Please select an end date.';
    } else if (startDate && (new Date(startDate) > new Date(endDate) || startDate > endDate)) {
      errors.end_date = 'Return date cannot be earlier than pick-up date';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...errors }));
      return;
    }
    setFormErrors(prev => ({ ...prev, item_guid: '', start_date: '', end_date: '' }));
    setEngineStatus(null);
    try {
      const res = await axios.post(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/hold`,
        {
          item_guid: selectedItemGuid,
          start_date: startDate,
          end_date: endDate,
          customer: customerForm,
        }
      );
      setActiveHold(res.data);
      await handleCheckAvailability();
      setEngineStatus({
        type: 'success',
        text: 'Item reserved on temporary hold while you complete your booking.',
      });
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Could not place a hold on the selected item.',
      });
    }
  };

  const handleReleaseHold = async () => {
    if (!activeHold?.reservation?.reservation_guid) return;
    setEngineStatus(null);
    try {
      await axios.delete(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/reservations/${encodeURIComponent(
          activeHold.reservation.reservation_guid
        )}/hold`
      );
      setActiveHold(null);
      await handleCheckAvailability();
      setEngineStatus({
        type: 'success',
        text: 'Your temporary hold has been released.',
      });
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Could not release hold.',
      });
    }
  };

  const handleConfirmCheckout = async (customCustomer?: any): Promise<boolean> => {
    setEngineStatus(null);
    const errors: Record<string, string> = {};

    if (!selectedItemGuid) {
      errors.item_guid = 'Please select a rental item.';
    }
    if (!startDate) {
      errors.start_date = 'Please select a start date.';
    }
    if (!endDate) {
      errors.end_date = 'Please select an end date.';
    } else if (startDate && (new Date(startDate) > new Date(endDate) || startDate > endDate)) {
      errors.end_date = 'Return date cannot be earlier than pick-up date';
    }

    const targetCustomer = customCustomer || customerForm;

    if (!targetCustomer.first_name?.trim()) {
      errors.first_name = 'First name is required.';
    }
    if (!targetCustomer.last_name?.trim()) {
      errors.last_name = 'Last name is required.';
    }

    const emailTrimmed = (targetCustomer.email || '').trim();
    const phoneTrimmed = (targetCustomer.phone_number || '').trim();

    if (!emailTrimmed && !phoneTrimmed) {
      errors.contact = 'Either email address or phone number is required.';
    } else {
      if (emailTrimmed && !/\S+@\S+\.\S+/.test(emailTrimmed)) {
        errors.email = 'Please enter a valid email address.';
      }
      if (phoneTrimmed && !/^\d{10}$/.test(phoneTrimmed.replace(/\D/g, ''))) {
        errors.phone_number = 'Please enter a valid 10-digit phone number.';
      }
    }

    if (profile?.user_guid && bookingForOthers && createAccountForOther) {
      if (!otherPassword) {
        errors.other_password = 'Password is required to create an account for this recipient.';
      } else {
        const pwdCheck = evaluatePasswordStrength(otherPassword);
        if (!pwdCheck.isValid) {
          errors.other_password = pwdCheck.errors[0] || 'Password does not meet complexity requirements.';
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...errors }));
      return false;
    }

    setFormErrors({});

    try {
      if (profile?.user_guid && bookingForOthers && createAccountForOther) {
        try {
          await axios.post(`${BASE_URL}/auth/customer/signup`, {
            first_name: targetCustomer.first_name.trim(),
            last_name: targetCustomer.last_name.trim(),
            email: emailTrimmed.toLowerCase(),
            phone_number: phoneTrimmed ? phoneTrimmed.replace(/\D/g, '') : '',
            password: otherPassword,
            sms_opt_in: targetCustomer.sms_opt_in,
            business: activeBusiness,
          });
        } catch (signupErr: any) {
          console.warn('Note on recipient account signup:', signupErr?.response?.data?.error);
        }
      }

      const res = await axios.post(
        `${BASE_URL}/api/${encodeURIComponent(activeBusiness)}/checkout/process`,
        {
          reservation_guid: activeHold?.reservation?.reservation_guid,
          item_guid: selectedItemGuid,
          start_date: startDate,
          end_date: endDate,
          user_guid: profile?.user_guid,
          customer: {
            ...targetCustomer,
            first_name: targetCustomer.first_name.trim(),
            last_name: targetCustomer.last_name.trim(),
            email: emailTrimmed || undefined,
            phone_number: phoneTrimmed ? phoneTrimmed.replace(/\D/g, '') : undefined,
          },
        },
        {
          headers: profile?.user_guid ? { 'x-user-guid': profile.user_guid } : undefined,
        }
      );
      setActiveHold(null);
      setLastConfirmedCheckout(res.data);
      // Reset rental form after confirming reservation
      setSelectedItemGuid('');
      setStartDate('');
      setEndDate('');
      if (!profile) {
        setCustomerForm({
          first_name: '',
          last_name: '',
          email: '',
          phone_number: '',
          sms_opt_in: false,
        });
      } else {
        setBookingForOthers(false);
        setCreateAccountForOther(false);
        setOtherPassword('');
        setCustomerForm({
          first_name: profile.first_name || '',
          last_name: profile.last_name || '',
          email: profile.email || '',
          phone_number: profile.phone_number || '',
          sms_opt_in: false,
        });
      }
      setAvailabilityResult(null);
      setShowAuthChoiceModal(false);

      setEngineStatus({
        type: 'success',
        text: bookingForOthers
          ? `Your reservation for ${targetCustomer.first_name.trim()} ${targetCustomer.last_name.trim()} is confirmed! Save the booking reference code below.`
          : 'Your reservation is confirmed! Save your booking reference code below to manage or modify your reservation anytime.',
      });
      return true;
    } catch (err: any) {
      setEngineStatus({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          err?.response?.data?.error ||
          'Unable to complete your reservation. Please verify your details and try again.',
      });
      return false;
    }
  };

  const handleInitiateGuestCheckout = async () => {
    // If user is already logged in, complete directly!
    if (profile?.user_guid) {
      await handleConfirmCheckout();
      return;
    }

    // Validate fields before showing options
    const targetCustomer = customerForm;
    const errors: Record<string, string> = {};

    if (!selectedItemGuid) {
      errors.item_guid = 'Please select a rental item.';
    }
    if (!startDate) {
      errors.start_date = 'Please select a start date.';
    }
    if (!endDate) {
      errors.end_date = 'Please select an end date.';
    } else if (startDate && (new Date(startDate) > new Date(endDate) || startDate > endDate)) {
      errors.end_date = 'Return date cannot be earlier than pick-up date';
    }

    if (!targetCustomer.first_name?.trim()) {
      errors.first_name = 'First name is required.';
    }
    if (!targetCustomer.last_name?.trim()) {
      errors.last_name = 'Last name is required.';
    }

    const emailTrimmed = (targetCustomer.email || '').trim();
    const phoneTrimmed = (targetCustomer.phone_number || '').trim();

    if (!emailTrimmed && !phoneTrimmed) {
      errors.contact = 'Either email address or phone number is required.';
    } else {
      if (emailTrimmed && !/\S+@\S+\.\S+/.test(emailTrimmed)) {
        errors.email = 'Please enter a valid email address.';
      }
      if (phoneTrimmed && !/^\d{10}$/.test(phoneTrimmed.replace(/\D/g, ''))) {
        errors.phone_number = 'Please enter a valid 10-digit phone number.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(prev => ({ ...prev, ...errors }));
      return;
    }

    setFormErrors({});
    setModalView('choice');
    setShowAuthChoiceModal(true);
  };

  const handleCreateAccountAndComplete = async (completeReservation = true) => {
    setCreateAccountError('');
    const errors: Record<string, string> = {};

    if (!customerForm.first_name.trim()) {
      errors.first_name = 'First name is required.';
    }
    if (!customerForm.last_name.trim()) {
      errors.last_name = 'Last name is required.';
    }

    const emailTrimmed = customerForm.email.trim();
    const phoneTrimmed = customerForm.phone_number.trim();
    const phoneDigits = phoneTrimmed.replace(/\D/g, '');

    if (!emailTrimmed) {
      errors.email = 'Email address is required to create an account.';
    } else if (!/\S+@\S+\.\S+/.test(emailTrimmed)) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!phoneTrimmed) {
      errors.phone_number = 'Phone number is required to create an account.';
    } else if (phoneDigits.length !== 10) {
      errors.phone_number = 'Please enter a valid 10-digit phone number.';
    }

    if (!createPassword) {
      errors.create_password = 'Password is required.';
    } else {
      const pwdStrength = evaluatePasswordStrength(createPassword);
      if (!pwdStrength.isValid) {
        errors.create_password = pwdStrength.errors[0] || 'Password does not meet requirements.';
      }
    }

    if (createPassword !== createConfirmPassword) {
      errors.create_confirm = 'Passwords do not match.';
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors((prev) => ({ ...prev, ...errors }));
      setCreateAccountError(Object.values(errors)[0]);
      return;
    }

    setIsCreatingAccount(true);
    try {
      const signupRes = await axios.post(`${BASE_URL}/auth/customer/signup`, {
        first_name: customerForm.first_name.trim(),
        last_name: customerForm.last_name.trim(),
        email: emailTrimmed.toLowerCase(),
        phone_number: phoneDigits,
        password: createPassword,
        sms_opt_in: customerForm.sms_opt_in,
        business: activeBusiness,
      });

      const createdProfile = signupRes.data?.profile;
      if (createdProfile?.user_guid) {
        const userSession = {
          userGuid: createdProfile.user_guid,
          business: createdProfile.business || activeBusiness,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          deviceType: 'Desktop',
        };
        localStorage.setItem('userSession', JSON.stringify(userSession));
        await refreshProfile(createdProfile.user_guid);
        auth.login();
      }

      setShowAuthChoiceModal(false);
      setCreatePassword('');
      setCreateConfirmPassword('');

      if (completeReservation) {
        const success = await handleConfirmCheckout({
          ...customerForm,
          email: emailTrimmed,
          phone_number: phoneDigits,
        });
        if (success) {
          setEngineStatus({
            type: 'success',
            text: 'Account created and your reservation is confirmed! You can now manage your bookings anytime.',
          });
        }
      } else {
        setEngineStatus({
          type: 'success',
          text: 'Account successfully created! Your reservation details are saved below — click Complete Reservation to finish.',
        });
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || 'Could not create account.';
      setCreateAccountError(msg);
      setEngineStatus({ type: 'error', text: msg });
    } finally {
      setIsCreatingAccount(false);
    }
  };

  const handleSignInAndComplete = async (completeReservation = true) => {
    setSignInError('');
    const ident = (signInIdentifier || customerForm.email || customerForm.phone_number || '').trim();
    if (!ident) {
      setSignInError('Please enter your email address or phone number.');
      return;
    }
    if (!signInPassword) {
      setSignInError('Please enter your password.');
      return;
    }

    setIsSigningIn(true);
    try {
      const loginRes = await axios.post(`${BASE_URL}/auth/customer/login`, {
        identifier: ident,
        password: signInPassword,
      });

      const loggedInProfile = loginRes.data?.profile;
      if (loggedInProfile?.user_guid) {
        const userSession = {
          userGuid: loggedInProfile.user_guid,
          business: loggedInProfile.business || activeBusiness,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
          deviceType: 'Desktop',
        };
        localStorage.setItem('userSession', JSON.stringify(userSession));
        await refreshProfile(loggedInProfile.user_guid);
        auth.login();

        // Populate customerForm with customer's profile so they don't have to enter it again!
        const updatedCustomer = {
          first_name: loggedInProfile.first_name || customerForm.first_name,
          last_name: loggedInProfile.last_name || customerForm.last_name,
          email: loggedInProfile.email || customerForm.email,
          phone_number: loggedInProfile.phone_number || customerForm.phone_number,
          sms_opt_in: customerForm.sms_opt_in,
        };
        setCustomerForm(updatedCustomer);

        setShowAuthChoiceModal(false);
        setSignInPassword('');

        if (completeReservation) {
          const success = await handleConfirmCheckout(updatedCustomer);
          if (success) {
            setEngineStatus({
              type: 'success',
              text: 'Signed in and your reservation is confirmed! You can now manage your bookings anytime.',
            });
          }
        } else {
          setEngineStatus({
            type: 'success',
            text: 'Signed in successfully! Your reservation details are saved below — click Complete Reservation to finish.',
          });
        }
      } else {
        setSignInError('Sign in failed. Please try again.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Invalid identifier or password. Please try again.';
      setSignInError(msg);
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('userSession');
    setProfile(null);
    auth.logout();
    setCheckoutMode('guest');
    setEngineStatus({
      type: 'success',
      text: 'You have been signed out. Your selected item and dates remain saved below.',
    });
  };

  const activeSessionData = lastConfirmedCheckout;

  return (
    <div className={classes.portalWrapper}>
      {/* Top Navigation Bar */}
      <div className={classes.switcherBar}>
        <div className={classes.badgeRow}>
          <button
            type="button"
            className={classes.secondaryBtn}
            onClick={() => navigate('/?reservations=1')}
          >
            ← Change Location
          </button>
          <span style={{ fontWeight: 700, color: '#174b0f', fontSize: '0.95rem' }}>
            📍 {tenantConfig?.physical_address || 'Rental Location'}
          </span>
        </div>

        <div className={classes.badgeRow}>
          {isSupervisorForActiveTenant && (
            <Link to={`/admin/${encodeURIComponent(activeBusiness)}`} className={classes.primaryBtn}>
              Control Panel
            </Link>
          )}
        </div>
      </div>

      {/* Location Header Banner */}
      <section className={classes.tenantBanner}>
        <div className={classes.bannerTitleGroup}>
          <h1>
            {loadingConfig
              ? 'Loading Location...'
              : (tenantConfig?.business_name || tenantConfig?.physical_address || 'Equipment & Experience Reservations')}
          </h1>
          <p>
            {tenantConfig?.physical_address ? `📍 ${tenantConfig.physical_address}` : '📍 Location on file'}
            {tenantConfig?.contact_email ? ` • ✉️ ${tenantConfig.contact_email}` : ''}
            {tenantConfig?.contact_phone ? ` • 📞 ${tenantConfig.contact_phone}` : ''}
          </p>
        </div>

        <div className={classes.badgeRow}>
          <span className={classes.pill}>
            Free Cancellation: Up to {tenantConfig?.policies?.free_change_cutoff_hours ?? 168} hrs before start
          </span>
          <span className={classes.pill}>
            Sales Tax: {tenantConfig?.pricing?.tax_rate_percent ?? 8.25}%
          </span>
        </div>
      </section>

      {/* Available Rental Equipment Catalog */}
      <div className={classes.card}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h3>Available Rentals</h3>
            <p>Select an item below to check date availability and complete your reservation.</p>
          </div>
          {isSupervisorForActiveTenant && (
            <Link
              to={`/admin/${encodeURIComponent(activeBusiness)}`}
              className={classes.secondaryBtn}
            >
              + Manage Inventory
            </Link>
          )}
        </div>

        {loadingItems ? (
          <p style={{ padding: '16px 0' }}>Loading available rentals...</p>
        ) : items.length === 0 ? (
          <div
            style={{
              background: '#f4fbf2',
              border: '1px dashed #b5d6ae',
              borderRadius: '12px',
              padding: '24px',
              textAlign: 'center',
              marginTop: '12px',
            }}
          >
            <strong style={{ display: 'block', marginBottom: '6px', color: '#174b0f' }}>
              No rental items are currently listed at this location
            </strong>
            <p style={{ margin: 0 }}>
              Please check back soon or choose another location.
            </p>
          </div>
        ) : (
          <div className={classes.gridThree} style={{ marginTop: '16px', marginBottom: 0 }}>
            {items.map((item) => {
              const isSelected = selectedItemGuid === item.item_guid;
              return (
                <div
                  key={item.item_guid}
                  className={classes.card}
                  style={{
                    background: isSelected ? '#eef9ec' : '#ffffff',
                    border: isSelected ? '2px solid #174b0f' : '1px solid #d5ead0',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    padding: '16px',
                    transition: 'all 0.2s ease',
                  }}
                  onClick={() => handleSelectItem(item.item_guid)}
                >
                  {/* Photo of Rental / Image Carousel */}
                  {(() => {
                    const rawImages =
                      Array.isArray(item.images) && item.images.length > 0
                        ? item.images.filter(Boolean)
                        : [];
                    const itemImages = rawImages.map(formatImageUrl).filter(Boolean);
                    const currentIdx =
                      itemImages.length > 0 ? getItemImageIndex(item.item_guid, itemImages.length) : 0;
                    if (itemImages.length === 0) {
                      return (
                        <div
                          style={{
                            width: '100%',
                            height: '190px',
                            borderRadius: '8px',
                            marginBottom: '12px',
                            background: 'linear-gradient(135deg, #e8f4e5 0%, #d4e9d0 100%)',
                            border: '1px solid #c3dfc0',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px',
                            boxSizing: 'border-box',
                            textAlign: 'center',
                            position: 'relative',
                            userSelect: 'none',
                          }}
                        >
                          {/* Price Tag */}
                          <span
                            className={`${classes.pill} ${classes.pillHighlight}`}
                            style={{
                              position: 'absolute',
                              top: '8px',
                              right: '8px',
                              background: 'rgba(255, 255, 255, 0.95)',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                              fontWeight: 700,
                              pointerEvents: 'none',
                              zIndex: 2,
                            }}
                          >
                            {formatMoney(item.daily_rate_cents)} / day
                          </span>
                          <div style={{ fontSize: '2.5rem', marginBottom: '8px', opacity: 0.9 }}>📦</div>
                          <strong
                            style={{
                              fontSize: '1.05rem',
                              color: '#174b0f',
                              lineHeight: 1.35,
                              maxWidth: '100%',
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {item.name}
                          </strong>
                          <span style={{ fontSize: '0.74rem', color: '#44753c', marginTop: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Rental Equipment
                          </span>
                        </div>
                      );
                    }

                    const currentImg = itemImages[currentIdx] || getFallbackPhotoForName(item.name);

                    return (
                      <div
                        style={{
                          width: '100%',
                          height: '190px',
                          borderRadius: '8px',
                          overflow: 'hidden',
                          marginBottom: '12px',
                          background: '#eef5ec',
                          position: 'relative',
                          userSelect: 'none',
                        }}
                      >
                        <img
                          src={currentImg}
                          alt={`${item.name} (${currentIdx + 1})`}
                          loading="lazy"
                          title="Click to magnify photo"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = getFallbackPhotoForName(item.name);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMagnifiedImage({ item, index: currentIdx });
                          }}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                            cursor: 'zoom-in',
                            transition: 'opacity 0.2s ease',
                          }}
                        />

                        {/* Price Tag */}
                        <span
                          className={`${classes.pill} ${classes.pillHighlight}`}
                          style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            background: 'rgba(255, 255, 255, 0.95)',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
                            fontWeight: 700,
                            pointerEvents: 'none',
                            zIndex: 2,
                          }}
                        >
                          {formatMoney(item.daily_rate_cents)} / day
                        </span>

                        {/* Magnify Hint Button on top-left */}
                        <button
                          type="button"
                          title="Click to magnify image"
                          style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: 'rgba(15, 35, 12, 0.72)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            cursor: 'zoom-in',
                            backdropFilter: 'blur(3px)',
                            zIndex: 2,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMagnifiedImage({ item, index: currentIdx });
                          }}
                        >
                          🔍 Zoom
                        </button>

                        {/* Prev / Next Carousel Controls if multiple images */}
                        {itemImages.length > 1 && (
                          <>
                            <button
                              type="button"
                              title="Previous Image"
                              aria-label="Previous image"
                              style={{
                                position: 'absolute',
                                left: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'rgba(15, 35, 12, 0.75)',
                                color: '#ffffff',
                                border: '1px solid rgba(255,255,255,0.4)',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                                zIndex: 3,
                              }}
                              onClick={(e) => handlePrevImage(item.item_guid, itemImages.length, e)}
                            >
                              ‹
                            </button>

                            <button
                              type="button"
                              title="Next Image"
                              aria-label="Next image"
                              style={{
                                position: 'absolute',
                                right: '6px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'rgba(15, 35, 12, 0.75)',
                                color: '#ffffff',
                                border: '1px solid rgba(255,255,255,0.4)',
                                borderRadius: '50%',
                                width: '28px',
                                height: '28px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: 'bold',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
                                zIndex: 3,
                              }}
                              onClick={(e) => handleNextImage(item.item_guid, itemImages.length, e)}
                            >
                              ›
                            </button>

                            {/* Dot Indicators */}
                            <div
                              style={{
                                position: 'absolute',
                                bottom: '8px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: 'rgba(15, 35, 12, 0.65)',
                                padding: '3px 8px',
                                borderRadius: '12px',
                                zIndex: 3,
                                backdropFilter: 'blur(3px)',
                              }}
                            >
                              {itemImages.map((_, dotIdx) => (
                                <span
                                  key={dotIdx}
                                  style={{
                                    width: dotIdx === currentIdx ? '8px' : '5px',
                                    height: dotIdx === currentIdx ? '8px' : '5px',
                                    borderRadius: '50%',
                                    background: dotIdx === currentIdx ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                                    transition: 'all 0.2s ease',
                                  }}
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}

                  <h3 style={{ margin: 0, fontSize: '1.05rem', color: '#174b0f' }}>{item.name}</h3>

                  <p
                    style={{
                      marginTop: '6px',
                      marginBottom: '12px',
                      fontSize: '0.85rem',
                      color: '#475569',
                      flex: '1 1 auto',
                    }}
                  >
                    {item.description || 'Quality rental equipment available for daily booking.'}
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 'auto',
                      paddingTop: '8px',
                      borderTop: '1px solid #f0f7ef',
                    }}
                  >
                    <small style={{ fontWeight: 700, color: '#246a19' }}>
                      {item.active_units_count ?? 0} Available
                    </small>
                    <button
                      type="button"
                      className={isSelected ? classes.primaryBtn : classes.secondaryBtn}
                      style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectItem(item.item_guid);
                      }}
                    >
                      {isSelected ? '✓ Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Status Alert */}
      {engineStatus && (
        <div
          className={`${classes.statusAlert} ${
            engineStatus.type === 'success' ? classes.statusSuccess : classes.statusError
          }`}
          style={{ marginTop: '20px' }}
        >
          {engineStatus.text}
        </div>
      )}

      {/* Booking Confirmation Banner */}
      {activeSessionData && (
        <div
          className={classes.card}
          style={{
            marginTop: '20px',
            background: '#f3fbf1',
            border: '1px solid #b7ddb0',
          }}
        >
          <h3 style={{ margin: '0 0 8px 0', color: '#174b0f' }}>
            Reservation Confirmed
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
              fontSize: '0.9rem',
            }}
          >
            <div>
              <strong>Booking Reference Code:</strong>{' '}
              <code>{activeSessionData.manage_token}</code>
            </div>
            <div>
              <strong>Customer Email:</strong>{' '}
              <span>{activeSessionData.customer?.email || customerForm.email || '—'}</span>
            </div>
            <div>
              <strong>Direct Management Link:</strong>{' '}
              <Link
                to={`/book/${encodeURIComponent(activeBusiness)}/manage?manage_token=${encodeURIComponent(
                  activeSessionData.manage_token || ''
                )}`}
              >
                Open My Reservation
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Book a Reservation */}
      <div ref={bookingFormRef} id="book-a-reservation-form" style={{ marginTop: '20px' }}>
        <div className={classes.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <h3 style={{ margin: 0 }}>Book a Reservation</h3>
            <Link to={`/book/${encodeURIComponent(activeBusiness)}/manage`} className={classes.secondaryBtn}>
              Manage an Existing Reservation →
            </Link>
          </div>
          <p>Choose your item and rental dates. Once they're available, you'll enter your contact details.</p>

          {/* Selected Item Preview with Photo & Gallery */}
          {selectedItem && (() => {
            const rawImages =
              Array.isArray(selectedItem.images) && selectedItem.images.length > 0
                ? selectedItem.images.filter(Boolean)
                : [];
            const selImages = rawImages.map(formatImageUrl).filter(Boolean);
            const selIdx = selImages.length > 0 ? getItemImageIndex(selectedItem.item_guid, selImages.length) : 0;
            const selImg = selImages[selIdx] || getFallbackPhotoForName(selectedItem.name);

            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  marginBottom: '16px',
                  padding: '12px 14px',
                  background: '#f4fbf2',
                  borderRadius: '10px',
                  border: '1px solid #cbe6c6',
                }}
              >
                {selImages.length === 0 ? (
                  <div
                    style={{
                      width: '70px',
                      height: '70px',
                      flexShrink: 0,
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #e8f4e5 0%, #d4e9d0 100%)',
                      border: '1px solid #c3dfc0',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px',
                      textAlign: 'center',
                      boxSizing: 'border-box',
                    }}
                  >
                    <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>📦</span>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        color: '#174b0f',
                        marginTop: '2px',
                        lineHeight: 1.1,
                        overflow: 'hidden',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                      }}
                    >
                      {selectedItem.name}
                    </span>
                  </div>
                ) : (
                  <div style={{ position: 'relative', width: '70px', height: '70px', flexShrink: 0 }}>
                    <img
                      src={selImg}
                      alt={selectedItem.name}
                      title="Click to magnify photo"
                      onClick={() => setMagnifiedImage({ item: selectedItem, index: selIdx })}
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = getFallbackPhotoForName(selectedItem.name);
                      }}
                      style={{
                        width: '70px',
                        height: '70px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1px solid #b5d6ae',
                        cursor: 'zoom-in',
                      }}
                    />
                    {selImages.length > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          bottom: '2px',
                          right: '2px',
                          background: 'rgba(0,0,0,0.72)',
                          color: '#ffffff',
                          fontSize: '0.62rem',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          fontWeight: 700,
                        }}
                      >
                        {selIdx + 1}/{selImages.length}
                      </span>
                    )}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: '#2d6a2e', fontWeight: 700 }}>
                    Selected Rental Equipment
                  </div>
                  <strong style={{ fontSize: '1.02rem', color: '#174b0f', display: 'block', marginTop: '2px' }}>
                    {selectedItem.name}
                  </strong>
                  <span style={{ color: '#246a19', fontWeight: 600, fontSize: '0.88rem' }}>
                    {formatMoney(selectedItem.daily_rate_cents)} / day &bull; {selectedItem.active_units_count ?? 0} units available
                  </span>
                  {selImages.length > 1 && (
                    <div style={{ marginTop: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                        onClick={(e) => handlePrevImage(selectedItem.item_guid, selImages.length, e)}
                      >
                        ‹ Prev Photo
                      </button>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                        onClick={(e) => handleNextImage(selectedItem.item_guid, selImages.length, e)}
                      >
                        Next Photo ›
                      </button>
                      <button
                        type="button"
                        className={classes.secondaryBtn}
                        style={{ padding: '2px 8px', fontSize: '0.74rem' }}
                        onClick={() => setMagnifiedImage({ item: selectedItem, index: selIdx })}
                      >
                        🔍 Magnify
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          <div className={classes.formGrid}>
            <div className={classes.fieldGroup}>
              <label htmlFor="res-item-select">
                Rental Item <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="res-item-select"
                value={selectedItemGuid}
                style={formErrors.item_guid ? { borderColor: '#ef4444' } : undefined}
                onChange={(e) => {
                  setSelectedItemGuid(e.target.value);
                  if (formErrors.item_guid) setFormErrors(prev => ({ ...prev, item_guid: '' }));
                }}
              >
                <option value="">Select Rental Item...</option>
                {items.map((it) => (
                  <option key={it.item_guid} value={it.item_guid}>
                    {it.name} ({formatMoney(it.daily_rate_cents)}/day)
                  </option>
                ))}
              </select>
              {formErrors.item_guid && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {formErrors.item_guid}
                </p>
              )}
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="res-start-date">
                Start Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="res-start-date"
                type="date"
                value={startDate}
                style={{ cursor: 'pointer', ...(formErrors.start_date ? { borderColor: '#ef4444' } : {}) }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker();
                  } catch (err) {}
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setStartDate(val);
                  if (formErrors.start_date) setFormErrors(prev => ({ ...prev, start_date: '' }));
                  if (val && endDate && val > endDate) {
                    setFormErrors(prev => ({ ...prev, end_date: 'Return date cannot be earlier than pick-up date' }));
                  } else if (val && endDate) {
                    setFormErrors(prev => ({ ...prev, end_date: '' }));
                  }
                  if (val) {
                    setTimeout(() => {
                      if (endDateInputRef.current) {
                        endDateInputRef.current.focus();
                        try {
                          endDateInputRef.current.showPicker();
                        } catch (err) {}
                      }
                    }, 150);
                  }
                }}
              />
              {formErrors.start_date && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {formErrors.start_date}
                </p>
              )}
            </div>

            <div className={classes.fieldGroup}>
              <label htmlFor="res-end-date">
                End Date <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                ref={endDateInputRef}
                id="res-end-date"
                type="date"
                value={endDate}
                min={startDate || undefined}
                style={{ cursor: 'pointer', ...(formErrors.end_date ? { borderColor: '#ef4444' } : {}) }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker();
                  } catch (err) {}
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  setEndDate(val);
                  if (startDate && val && val < startDate) {
                    setFormErrors(prev => ({
                      ...prev,
                      end_date: 'Return date cannot be earlier than pick-up date',
                    }));
                  } else {
                    setFormErrors(prev => ({ ...prev, end_date: '' }));
                  }
                }}
              />
              {formErrors.end_date && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {formErrors.end_date}
                </p>
              )}
            </div>
          </div>

          <div className={classes.badgeRow} style={{ marginTop: '12px' }}>
            <button
              type="button"
              className={classes.secondaryBtn}
              onClick={handleCheckAvailability}
            >
              Check Availability &amp; Price
            </button>
          </div>

          {availabilityResult && (
            <div className={classes.metricGrid} style={{ marginTop: '14px' }}>
              <div className={classes.metricBox}>
                <span>Availability</span>
                <strong>{availabilityResult.is_available ? 'Available' : 'Unavailable'}</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Rental Duration</span>
                <strong>{availabilityResult.pricing?.days || 0} Days</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Subtotal</span>
                <strong>{formatMoney(availabilityResult.pricing?.subtotal_cents || 0)}</strong>
              </div>
              <div className={classes.metricBox}>
                <span>Total (incl. Tax)</span>
                <strong>{formatMoney(availabilityResult.pricing?.total_cents || 0)}</strong>
              </div>
            </div>
          )}

          {(activeHold || availabilityResult?.is_available) && (
          <>
          <hr style={{ margin: '22px 0 18px', borderColor: '#e2e8f0' }} />

          {/* Signed-in Status Banner */}
          {profile?.user_guid ? (
            <div style={{ marginBottom: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '10px',
                  marginBottom: '14px',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '1.4rem' }}>👤</span>
                  <div>
                    <span style={{ fontSize: '0.94rem', color: '#166534', fontWeight: 700, display: 'block' }}>
                      Logged in as {profile.first_name} {profile.last_name}
                    </span>
                    <span style={{ fontSize: '0.82rem', color: '#4b5563' }}>
                      {profile.email || profile.phone_number || ''} &bull; Customer Account
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  style={{ padding: '5px 14px', fontSize: '0.82rem', cursor: 'pointer' }}
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
              </div>

              {/* Option to create for myself vs create for others */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                  <h4 style={{ margin: 0, color: '#174b0f', fontSize: '1.02rem' }}>
                    Who are you creating this reservation for?
                  </h4>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setBookingForOthers(false);
                      setCreateAccountForOther(false);
                      setOtherPassword('');
                      setCustomerForm({
                        first_name: profile.first_name || '',
                        last_name: profile.last_name || '',
                        email: profile.email || '',
                        phone_number: profile.phone_number || '',
                        sms_opt_in: false,
                      });
                      setFormErrors({});
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: !bookingForOthers ? '2px solid #15803d' : '1px solid #cbd5e1',
                      backgroundColor: !bookingForOthers ? '#f0fdf4' : '#ffffff',
                      color: !bookingForOthers ? '#166534' : '#334155',
                      fontWeight: !bookingForOthers ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      boxShadow: !bookingForOthers ? '0 2px 4px rgba(22,101,52,0.15)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '1.1rem' }}>👤</span>
                      <strong style={{ fontSize: '0.94rem' }}>Book for Myself</strong>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Use my account details ({profile.first_name} {profile.last_name})
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingForOthers(true);
                      setCustomerForm({
                        first_name: '',
                        last_name: '',
                        email: '',
                        phone_number: '',
                        sms_opt_in: false,
                      });
                      setFormErrors({});
                    }}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      border: bookingForOthers ? '2px solid #15803d' : '1px solid #cbd5e1',
                      backgroundColor: bookingForOthers ? '#f0fdf4' : '#ffffff',
                      color: bookingForOthers ? '#166534' : '#334155',
                      fontWeight: bookingForOthers ? 700 : 500,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      boxShadow: bookingForOthers ? '0 2px 4px rgba(22,101,52,0.15)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '1.1rem' }}>👥</span>
                      <strong style={{ fontSize: '0.94rem' }}>Create for Someone Else</strong>
                    </div>
                    <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                      Book on behalf of a friend, family member, or client
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Option Switcher: Complete as Guest, Create Account, or Sign In */
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: '#174b0f', fontSize: '1.05rem' }}>
                  Choose How to Complete Your Reservation:
                </h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('guest');
                    setCreateAccountError('');
                    setSignInError('');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: checkoutMode === 'guest' ? '2px solid #15803d' : '1px solid #cbd5e1',
                    backgroundColor: checkoutMode === 'guest' ? '#f0fdf4' : '#ffffff',
                    color: checkoutMode === 'guest' ? '#166534' : '#334155',
                    fontWeight: checkoutMode === 'guest' ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: checkoutMode === 'guest' ? '0 2px 4px rgba(22,101,52,0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>👤</span>
                    <strong style={{ fontSize: '0.94rem' }}>Complete as Guest</strong>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Fast booking without password
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('create_account');
                    setCreateAccountError('');
                    setSignInError('');
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: checkoutMode === 'create_account' ? '2px solid #15803d' : '1px solid #cbd5e1',
                    backgroundColor: checkoutMode === 'create_account' ? '#f0fdf4' : '#ffffff',
                    color: checkoutMode === 'create_account' ? '#166534' : '#334155',
                    fontWeight: checkoutMode === 'create_account' ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: checkoutMode === 'create_account' ? '0 2px 4px rgba(22,101,52,0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>📝</span>
                    <strong style={{ fontSize: '0.94rem' }}>Create Account</strong>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Data pre-filled, add password
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCheckoutMode('sign_in');
                    setCreateAccountError('');
                    setSignInError('');
                    if (!signInIdentifier) {
                      setSignInIdentifier(customerForm.email || customerForm.phone_number || '');
                    }
                  }}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: checkoutMode === 'sign_in' ? '2px solid #15803d' : '1px solid #cbd5e1',
                    backgroundColor: checkoutMode === 'sign_in' ? '#f0fdf4' : '#ffffff',
                    color: checkoutMode === 'sign_in' ? '#166534' : '#334155',
                    fontWeight: checkoutMode === 'sign_in' ? 700 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    boxShadow: checkoutMode === 'sign_in' ? '0 2px 4px rgba(22,101,52,0.15)' : 'none',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '1.1rem' }}>🔐</span>
                    <strong style={{ fontSize: '0.94rem' }}>Sign In</strong>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Already have an account?
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* OPTION 1: COMPLETE AS GUEST (OR LOGGED-IN CUSTOMER)       */}
          {/* ======================================================== */}
          {(checkoutMode === 'guest' || Boolean(profile?.user_guid)) && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
                <h4 style={{ margin: 0, color: '#174b0f' }}>
                  {profile?.user_guid && bookingForOthers
                    ? "Recipient's Contact Information"
                    : 'Your Contact Information'}
                </h4>
                {profile?.user_guid && bookingForOthers && (
                  <button
                    type="button"
                    onClick={() => {
                      setBookingForOthers(false);
                      setCreateAccountForOther(false);
                      setOtherPassword('');
                      setCustomerForm({
                        first_name: profile?.first_name || '',
                        last_name: profile?.last_name || '',
                        email: profile?.email || '',
                        phone_number: profile?.phone_number || '',
                        sms_opt_in: false,
                      });
                      setFormErrors({});
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#15803d',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    ↺ Revert to booking for myself
                  </button>
                )}
              </div>
              <p style={{ margin: '0 0 12px 0', fontSize: '0.86rem', color: '#64748b' }}>
                {profile?.user_guid
                  ? (bookingForOthers
                      ? 'Enter the recipient’s contact details below. This reservation will be managed under your customer account.'
                      : 'Your contact details from your customer account are pre-filled below.')
                  : 'Enter your contact details below to complete your reservation as a guest.'}
              </p>

              {formErrors.contact && (
                <div
                  style={{
                    marginBottom: '12px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {formErrors.contact}
                </div>
              )}

              <div className={classes.formGrid}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="cust-first-name">
                    First Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="cust-first-name"
                    type="text"
                    placeholder="First Name"
                    value={customerForm.first_name}
                    style={formErrors.first_name ? { borderColor: '#ef4444' } : undefined}
                    onChange={(e) => {
                      setCustomerForm({ ...customerForm, first_name: e.target.value });
                      if (formErrors.first_name) setFormErrors(prev => ({ ...prev, first_name: '' }));
                    }}
                  />
                  {formErrors.first_name && (
                    <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                      {formErrors.first_name}
                    </p>
                  )}
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="cust-last-name">
                    Last Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="cust-last-name"
                    type="text"
                    placeholder="Last Name"
                    value={customerForm.last_name}
                    style={formErrors.last_name ? { borderColor: '#ef4444' } : undefined}
                    onChange={(e) => {
                      setCustomerForm({ ...customerForm, last_name: e.target.value });
                      if (formErrors.last_name) setFormErrors(prev => ({ ...prev, last_name: '' }));
                    }}
                  />
                  {formErrors.last_name && (
                    <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                      {formErrors.last_name}
                    </p>
                  )}
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="cust-email">
                    Email Address{' '}
                    <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 400 }}>
                      (Either email or phone <span style={{ color: '#ef4444' }}>*</span>)
                    </span>
                  </label>
                  <input
                    id="cust-email"
                    type="email"
                    placeholder="name@example.com"
                    value={customerForm.email}
                    style={formErrors.email || formErrors.contact ? { borderColor: '#ef4444' } : undefined}
                    onChange={(e) => {
                      setCustomerForm({ ...customerForm, email: e.target.value });
                      if (formErrors.email || formErrors.contact) {
                        setFormErrors(prev => ({ ...prev, email: '', contact: '' }));
                      }
                    }}
                  />
                  {formErrors.email && (
                    <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                      {formErrors.email}
                    </p>
                  )}
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="cust-phone">
                    Phone Number{' '}
                    <span style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 400 }}>
                      (Either email or phone <span style={{ color: '#ef4444' }}>*</span>)
                    </span>
                  </label>
                  <input
                    id="cust-phone"
                    type="tel"
                    placeholder="(555) 000-0000"
                    value={customerForm.phone_number}
                    style={formErrors.phone_number || formErrors.contact ? { borderColor: '#ef4444' } : undefined}
                    onChange={(e) => {
                      setCustomerForm({ ...customerForm, phone_number: e.target.value });
                      if (formErrors.phone_number || formErrors.contact) {
                        setFormErrors(prev => ({ ...prev, phone_number: '', contact: '' }));
                      }
                    }}
                  />
                  {formErrors.phone_number && (
                    <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                      {formErrors.phone_number}
                    </p>
                  )}
                </div>
              </div>

              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="cust-sms-opt-in"
                  type="checkbox"
                  checked={customerForm.sms_opt_in}
                  onChange={(e) => setCustomerForm({ ...customerForm, sms_opt_in: e.target.checked })}
                />
                <label htmlFor="cust-sms-opt-in" style={{ fontSize: '0.86rem', fontWeight: 500 }}>
                  {profile?.user_guid && bookingForOthers
                    ? 'Send recipient SMS booking confirmations and reminders'
                    : 'Send me SMS booking confirmations and reminders'}
                </label>
              </div>

              {/* Optional: Create account for recipient when booking for others */}
              {profile?.user_guid && bookingForOthers && (
                <div style={{ marginTop: '14px', padding: '14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      id="cust-create-account-other"
                      type="checkbox"
                      checked={createAccountForOther}
                      onChange={(e) => {
                        setCreateAccountForOther(e.target.checked);
                        if (!e.target.checked) {
                          setOtherPassword('');
                          if (formErrors.other_password) {
                            setFormErrors(prev => ({ ...prev, other_password: '' }));
                          }
                        }
                      }}
                    />
                    <label htmlFor="cust-create-account-other" style={{ fontSize: '0.88rem', fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
                      Also create a customer account for this recipient
                    </label>
                  </div>
                  <p style={{ margin: '4px 0 0 24px', fontSize: '0.80rem', color: '#64748b' }}>
                    Optional: Register an account using the recipient's name and email so they can log in to view or manage their reservation.
                  </p>

                  {createAccountForOther && (
                    <div style={{ marginTop: '12px', paddingLeft: '24px' }}>
                      <div className={classes.fieldGroup}>
                        <label htmlFor="other-password" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                          Create Password for Recipient <span style={{ color: '#ef4444' }}>*</span>
                        </label>
                        <input
                          id="other-password"
                          type="password"
                          placeholder="Password (min 8 chars, 1 uppercase, 1 number)"
                          value={otherPassword}
                          style={formErrors.other_password ? { borderColor: '#ef4444' } : { maxWidth: '340px' }}
                          onChange={(e) => {
                            setOtherPassword(e.target.value);
                            if (formErrors.other_password) {
                              setFormErrors(prev => ({ ...prev, other_password: '' }));
                            }
                          }}
                        />
                        {formErrors.other_password && (
                          <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                            {formErrors.other_password}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeHold && (
                <div
                  className={`${classes.statusAlert} ${classes.statusSuccess}`}
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <strong>
                      Item Held — {Math.floor(holdSecondsLeft / 60)}:
                      {String(holdSecondsLeft % 60).padStart(2, '0')} remaining
                    </strong>
                    <div style={{ fontSize: '0.84rem' }}>
                      Total Due: {formatMoney(activeHold.pricing?.total_cents || 0)}
                    </div>
                  </div>
                  <button type="button" className={classes.secondaryBtn} onClick={handleReleaseHold}>
                    Release Hold
                  </button>
                </div>
              )}

              <div className={classes.badgeRow} style={{ marginTop: '18px' }}>
                {!activeHold && (
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    disabled={!selectedItemGuid}
                    onClick={handleCreateHold}
                  >
                    Hold Item
                  </button>
                )}
                <button
                  type="button"
                  className={classes.primaryBtn}
                  disabled={!selectedItemGuid}
                  onClick={() => {
                    if (profile?.user_guid) {
                      handleConfirmCheckout();
                    } else {
                      handleInitiateGuestCheckout();
                    }
                  }}
                >
                  {profile?.user_guid
                    ? (bookingForOthers
                        ? `Complete Reservation for ${customerForm.first_name.trim() || 'Someone Else'}`
                        : 'Complete Reservation')
                    : 'Complete Reservation as Guest'}
                </button>
              </div>

              {!profile?.user_guid && (
                <p style={{ marginTop: '12px', fontSize: '0.84rem', color: '#64748b' }}>
                  Want to save your details for future bookings?{' '}
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    onClick={() => { setCheckoutMode('create_account'); setCreateAccountError(''); }}
                  >
                    Create an Account
                  </button>
                  {' '}or{' '}
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    onClick={() => {
                      setCheckoutMode('sign_in');
                      setSignInIdentifier(customerForm.email || customerForm.phone_number || '');
                      setSignInError('');
                    }}
                  >
                    Sign In
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* OPTION 2: CREATE ACCOUNT & COMPLETE                      */}
          {/* ======================================================== */}
          {!profile?.user_guid && checkoutMode === 'create_account' && (
            <div style={{ background: '#fcfdfc', border: '1px solid #dcf2d9', borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.2rem' }}>📝</span>
                <h4 style={{ margin: 0, color: '#174b0f', fontSize: '1.05rem' }}>Create Account</h4>
              </div>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.86rem', color: '#475569' }}>
                Your contact details from above are pre-populated so you don't have to re-enter them. Enter a password to create your customer account and finalize your reservation.
              </p>

              {createAccountError && (
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {createAccountError}
                  {createAccountError.toLowerCase().includes('already exists') && (
                    <button
                      type="button"
                      style={{
                        marginLeft: '10px',
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '3px 8px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                      onClick={() => {
                        setCheckoutMode('sign_in');
                        setSignInIdentifier(customerForm.email || customerForm.phone_number || '');
                        setSignInError('');
                        setCreateAccountError('');
                      }}
                    >
                      Switch to Sign In →
                    </button>
                  )}
                </div>
              )}

              <div className={classes.formGrid}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="create-first-name">
                    First Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="create-first-name"
                    type="text"
                    placeholder="First Name"
                    value={customerForm.first_name}
                    onChange={(e) => setCustomerForm({ ...customerForm, first_name: e.target.value })}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="create-last-name">
                    Last Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="create-last-name"
                    type="text"
                    placeholder="Last Name"
                    value={customerForm.last_name}
                    onChange={(e) => setCustomerForm({ ...customerForm, last_name: e.target.value })}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="create-email">
                    Email Address <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="create-email"
                    type="email"
                    placeholder="name@example.com"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="create-phone">
                    Phone Number <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="create-phone"
                    type="tel"
                    placeholder="(555) 000-0000"
                    value={customerForm.phone_number}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone_number: e.target.value })}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="create-password">
                    Account Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <PasswordInput
                    id="create-password"
                    placeholder="Create a strong password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="create-confirm-password">
                    Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <PasswordInput
                    id="create-confirm-password"
                    placeholder="Re-enter password"
                    value={createConfirmPassword}
                    onChange={(e) => setCreateConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              {/* Password strength checklist */}
              <div style={{ maxWidth: '420px', marginTop: '8px' }}>
                <PasswordStrengthChecklist password={createPassword} showAlways={Boolean(createPassword)} />
              </div>

              <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  id="create-sms-opt-in"
                  type="checkbox"
                  checked={customerForm.sms_opt_in}
                  onChange={(e) => setCustomerForm({ ...customerForm, sms_opt_in: e.target.checked })}
                />
                <label htmlFor="create-sms-opt-in" style={{ fontSize: '0.86rem', fontWeight: 500 }}>
                  Send me SMS booking confirmations and reminders
                </label>
              </div>

              {activeHold && (
                <div
                  className={`${classes.statusAlert} ${classes.statusSuccess}`}
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <strong>
                      Item Held — {Math.floor(holdSecondsLeft / 60)}:
                      {String(holdSecondsLeft % 60).padStart(2, '0')} remaining
                    </strong>
                    <div style={{ fontSize: '0.84rem' }}>
                      Total Due: {formatMoney(activeHold.pricing?.total_cents || 0)}
                    </div>
                  </div>
                  <button type="button" className={classes.secondaryBtn} onClick={handleReleaseHold}>
                    Release Hold
                  </button>
                </div>
              )}

              <div className={classes.badgeRow} style={{ marginTop: '18px' }}>
                <button
                  type="button"
                  className={classes.primaryBtn}
                  disabled={!selectedItemGuid || isCreatingAccount}
                  onClick={() => handleCreateAccountAndComplete(true)}
                >
                  {isCreatingAccount ? 'Creating Account…' : 'Create Account'}
                </button>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  onClick={() => setCheckoutMode('guest')}
                >
                  Cancel
                </button>
              </div>

              <p style={{ marginTop: '12px', fontSize: '0.84rem', color: '#64748b' }}>
                Already have an account?{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => {
                    setCheckoutMode('sign_in');
                    setSignInIdentifier(customerForm.email || customerForm.phone_number || '');
                    setSignInError('');
                  }}
                >
                  Sign In instead
                </button>
                {' '}or{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => setCheckoutMode('guest')}
                >
                  Complete as Guest
                </button>
              </p>
            </div>
          )}

          {/* ======================================================== */}
          {/* OPTION 3: SIGN IN & COMPLETE                             */}
          {/* ======================================================== */}
          {!profile?.user_guid && checkoutMode === 'sign_in' && (
            <div style={{ background: '#fcfdfc', border: '1px solid #dcf2d9', borderRadius: '12px', padding: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔐</span>
                <h4 style={{ margin: 0, color: '#174b0f', fontSize: '1.05rem' }}>Sign In</h4>
              </div>
              <p style={{ margin: '0 0 14px 0', fontSize: '0.86rem', color: '#475569' }}>
                Sign in with your email or phone number and password. Your reservation details will be preserved and linked to your customer account.
              </p>

              {signInError && (
                <div
                  style={{
                    marginBottom: '14px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                  }}
                >
                  ⚠️ {signInError}
                </div>
              )}

              <div className={classes.formGrid}>
                <div className={classes.fieldGroup}>
                  <label htmlFor="signin-identifier">
                    Email Address or Phone Number <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="signin-identifier"
                    type="text"
                    placeholder="name@example.com or (555) 000-0000"
                    value={signInIdentifier}
                    onChange={(e) => setSignInIdentifier(e.target.value)}
                  />
                </div>

                <div className={classes.fieldGroup}>
                  <label htmlFor="signin-password">
                    Password <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <PasswordInput
                    id="signin-password"
                    placeholder="Enter your password"
                    value={signInPassword}
                    onChange={(e) => setSignInPassword(e.target.value)}
                  />
                </div>
              </div>

              {activeHold && (
                <div
                  className={`${classes.statusAlert} ${classes.statusSuccess}`}
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                  }}
                >
                  <div>
                    <strong>
                      Item Held — {Math.floor(holdSecondsLeft / 60)}:
                      {String(holdSecondsLeft % 60).padStart(2, '0')} remaining
                    </strong>
                    <div style={{ fontSize: '0.84rem' }}>
                      Total Due: {formatMoney(activeHold.pricing?.total_cents || 0)}
                    </div>
                  </div>
                  <button type="button" className={classes.secondaryBtn} onClick={handleReleaseHold}>
                    Release Hold
                  </button>
                </div>
              )}

              <div className={classes.badgeRow} style={{ marginTop: '18px' }}>
                <button
                  type="button"
                  className={classes.primaryBtn}
                  disabled={!selectedItemGuid || isSigningIn}
                  onClick={() => handleSignInAndComplete(true)}
                >
                  {isSigningIn ? 'Signing In…' : 'Sign In'}
                </button>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  onClick={() => setCheckoutMode('guest')}
                >
                  Cancel
                </button>
              </div>

              <p style={{ marginTop: '12px', fontSize: '0.84rem', color: '#64748b' }}>
                Don't have an account yet?{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => { setCheckoutMode('create_account'); setCreateAccountError(''); }}
                >
                  Create an Account
                </button>
                {' '}or{' '}
                <button
                  type="button"
                  style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  onClick={() => setCheckoutMode('guest')}
                >
                  Complete as Guest
                </button>
              </p>
            </div>
          )}
          </>
          )}
        </div>
      </div>

      {/* Clean Rental Policy Summary */}
      <div className={classes.gridThree} style={{ marginTop: '20px', marginBottom: 0 }}>
        <div className={classes.card}>
          <h3>Cancellation Policy</h3>
          <p>
            Cancel at least{' '}
            <strong>{tenantConfig?.policies?.free_change_cutoff_hours ?? 168} hours</strong> before
            your pick-up date for a <strong>100% refund</strong>. Cancellations within the cutoff
            window incur a{' '}
            <strong>{tenantConfig?.policies?.late_fee_percentage ?? 25}%</strong> late cancellation
            fee.
          </p>
        </div>

        <div className={classes.card}>
          <h3>Date Changes &amp; Extensions</h3>
          <p>
            Need extra time? Extending your rental carries <strong>no change fee</strong> — you only
            pay for the additional rental days plus applicable tax, subject to availability.
          </p>
        </div>

        <div className={classes.card}>
          <h3>Pricing &amp; Taxes</h3>
          <p>
            All rentals are billed in <strong>{tenantConfig?.currency || 'USD'}</strong> with a{' '}
            <strong>{tenantConfig?.pricing?.tax_rate_percent ?? 8.25}%</strong> sales tax calculated
            at checkout.
          </p>
        </div>
      </div>

      {/* MAGNIFIED IMAGE LIGHTBOX MODAL */}
      {magnifiedImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Magnified Rental Item Photo"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
            padding: '20px',
          }}
          onClick={() => setMagnifiedImage(null)}
        >
          {/* Top Bar with Title and Close Button */}
          <div
            style={{
              position: 'absolute',
              top: '16px',
              left: '20px',
              right: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#ffffff',
              zIndex: 100000,
              pointerEvents: 'none',
            }}
          >
            <div style={{ pointerEvents: 'auto', textShadow: '0 2px 4px rgba(0,0,0,0.85)' }}>
              <strong style={{ fontSize: '1.15rem' }}>{magnifiedImage.item.name}</strong>
              {Array.isArray(magnifiedImage.item.images) && magnifiedImage.item.images.length > 1 && (
                <span style={{ marginLeft: '12px', fontSize: '0.9rem', color: '#cbd5e1' }}>
                  Photo {magnifiedImage.index + 1} of {magnifiedImage.item.images.length}
                </span>
              )}
            </div>
            <button
              type="button"
              title="Close magnification (or click outside)"
              style={{
                pointerEvents: 'auto',
                background: 'rgba(255, 255, 255, 0.22)',
                color: '#ffffff',
                border: '1px solid rgba(255,255,255,0.4)',
                borderRadius: '50%',
                width: '38px',
                height: '38px',
                fontSize: '1.2rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.2s',
              }}
              onClick={() => setMagnifiedImage(null)}
            >
              ✕
            </button>
          </div>

          {/* Central Magnified Image Container */}
          <div
            style={{
              position: 'relative',
              maxWidth: '92vw',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'default',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={
                Array.isArray(magnifiedImage.item.images) &&
                magnifiedImage.item.images.length > 0 &&
                magnifiedImage.item.images[magnifiedImage.index]
                  ? formatImageUrl(magnifiedImage.item.images[magnifiedImage.index])
                  : getItemPhoto(magnifiedImage.item)
              }
              alt={`${magnifiedImage.item.name} (Magnified)`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = getFallbackPhotoForName(magnifiedImage.item.name);
              }}
              style={{
                maxWidth: '85vw',
                maxHeight: '74vh',
                objectFit: 'contain',
                borderRadius: '12px',
                boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8)',
                border: '2px solid rgba(255, 255, 255, 0.25)',
                userSelect: 'none',
              }}
            />

            {/* Back & Forth Navigation Inside Lightbox if > 1 image */}
            {Array.isArray(magnifiedImage.item.images) && magnifiedImage.item.images.length > 1 && (
              <>
                <button
                  type="button"
                  title="Previous Photo"
                  style={{
                    position: 'absolute',
                    left: '-52px',
                    top: '45%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    fontSize: '1.4rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}
                  onClick={() => {
                    const total = magnifiedImage.item.images.length;
                    setMagnifiedImage((prev) =>
                      prev ? { ...prev, index: (prev.index - 1 + total) % total } : null
                    );
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  title="Next Photo"
                  style={{
                    position: 'absolute',
                    right: '-52px',
                    top: '45%',
                    transform: 'translateY(-50%)',
                    background: 'rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    border: '1px solid rgba(255,255,255,0.4)',
                    borderRadius: '50%',
                    width: '44px',
                    height: '44px',
                    fontSize: '1.4rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                  }}
                  onClick={() => {
                    const total = magnifiedImage.item.images.length;
                    setMagnifiedImage((prev) =>
                      prev ? { ...prev, index: (prev.index + 1) % total } : null
                    );
                  }}
                >
                  ›
                </button>

                {/* Thumbnail Strip inside Lightbox */}
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    marginTop: '12px',
                    padding: '6px 12px',
                    background: 'rgba(0, 0, 0, 0.55)',
                    borderRadius: '10px',
                    overflowX: 'auto',
                    maxWidth: '85vw',
                  }}
                >
                  {magnifiedImage.item.images.map((imgUrl, thumbIdx) => (
                    <img
                      key={thumbIdx}
                      src={formatImageUrl(imgUrl)}
                      alt={`Thumbnail ${thumbIdx + 1}`}
                      style={{
                        width: '46px',
                        height: '46px',
                        objectFit: 'cover',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        border:
                          thumbIdx === magnifiedImage.index
                            ? '2px solid #52c41a'
                            : '2px solid transparent',
                        opacity: thumbIdx === magnifiedImage.index ? 1 : 0.6,
                        transition: 'all 0.2s',
                      }}
                      onClick={() =>
                        setMagnifiedImage((prev) => (prev ? { ...prev, index: thumbIdx } : null))
                      }
                    />
                  ))}
                </div>
              </>
            )}
            <p style={{ margin: '8px 0 0 0', color: '#cbd5e1', fontSize: '0.82rem' }}>
              Click outside the image to return to normal
            </p>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* AUTHENTICATION CHOICE MODAL                              */}
      {/* (Prompted when customer clicks Complete Reservation)    */}
      {/* ======================================================== */}
      {showAuthChoiceModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose How to Complete Reservation"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(5px)',
            zIndex: 99998,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box',
          }}
          onClick={() => {
            setShowAuthChoiceModal(false);
            setModalView('choice');
          }}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              maxWidth: '540px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '24px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
              boxSizing: 'border-box',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              aria-label="Close"
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: 'none',
                border: 'none',
                fontSize: '1.4rem',
                cursor: 'pointer',
                color: '#64748b',
                lineHeight: 1,
                padding: '4px',
              }}
              onClick={() => {
                setShowAuthChoiceModal(false);
                setModalView('choice');
              }}
            >
              ✕
            </button>

            {/* VIEW 1: CHOICE SELECTION (GUEST, CREATE ACCOUNT, SIGN IN) */}
            {modalView === 'choice' && (
              <div>
                <h3 style={{ margin: '0 0 6px 0', color: '#174b0f', fontSize: '1.25rem' }}>
                  Complete Your Reservation
                </h3>
                <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: '#64748b' }}>
                  Choose how you would like to complete your booking:
                </p>

                {/* Reservation Summary Pill */}
                {selectedItem && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: '#f4fbf2',
                      border: '1px solid #cbe6c6',
                      borderRadius: '8px',
                      marginBottom: '18px',
                      fontSize: '0.86rem',
                    }}
                  >
                    <strong style={{ color: '#174b0f', display: 'block' }}>
                      📦 {selectedItem.name}
                    </strong>
                    <div style={{ color: '#2d6a2e', marginTop: '2px' }}>
                      📅 {startDate} &rarr; {endDate} &bull; Total: {formatMoney(activeHold?.pricing?.total_cents || availabilityResult?.pricing?.total_cents || 0)}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Option 1: Complete as Guest */}
                  <div
                    style={{
                      border: '1px solid #d5ead0',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      backgroundColor: '#fcfdfc',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1.1rem' }}>👤</span>
                        <strong style={{ fontSize: '0.96rem', color: '#174b0f' }}>Complete as Guest</strong>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                        Quick checkout without a password. We'll send your booking reference code by email or SMS.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      style={{ padding: '8px 16px', fontSize: '0.86rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      onClick={() => {
                        setShowAuthChoiceModal(false);
                        handleConfirmCheckout();
                      }}
                    >
                      Complete as Guest &rarr;
                    </button>
                  </div>

                  {/* Option 2: Create Account */}
                  <div
                    style={{
                      border: '2px solid #22c55e',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      backgroundColor: '#f0fdf4',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1.1rem' }}>📝</span>
                        <strong style={{ fontSize: '0.96rem', color: '#166534' }}>Create an Account</strong>
                        <span style={{ backgroundColor: '#22c55e', color: '#ffffff', fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                          Recommended
                        </span>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#475569' }}>
                        Your details ({customerForm.first_name || 'Name'}, {customerForm.email || customerForm.phone_number || 'Contact'}) are pre-filled so you don't enter them again! Just add a password.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={classes.primaryBtn}
                      style={{ padding: '8px 16px', fontSize: '0.86rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      onClick={() => setModalView('create_account')}
                    >
                      Create Account &rarr;
                    </button>
                  </div>

                  {/* Option 3: Sign In */}
                  <div
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '12px',
                      backgroundColor: '#f8fafc',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '1.1rem' }}>🔐</span>
                        <strong style={{ fontSize: '0.96rem', color: '#334155' }}>Sign In to Existing Account</strong>
                      </div>
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#64748b' }}>
                        Already have an account? Sign in with your password to link this reservation.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={classes.secondaryBtn}
                      style={{ padding: '8px 16px', fontSize: '0.86rem', whiteSpace: 'nowrap', cursor: 'pointer' }}
                      onClick={() => {
                        setSignInIdentifier(customerForm.email || customerForm.phone_number || '');
                        setModalView('sign_in');
                      }}
                    >
                      Sign In &rarr;
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: MODAL CREATE ACCOUNT */}
            {modalView === 'create_account' && (
              <div>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#15803d',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    marginBottom: '8px',
                    padding: 0,
                  }}
                  onClick={() => setModalView('choice')}
                >
                  &larr; Back to options
                </button>
                <h3 style={{ margin: '0 0 4px 0', color: '#174b0f', fontSize: '1.2rem' }}>
                  Create Account
                </h3>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Your contact details are pre-filled below so you don't have to enter them again. Create your password to complete your reservation.
                </p>

                {createAccountError && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {createAccountError}
                  </div>
                )}

                <div className={classes.formGrid}>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-first-name">
                      First Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="modal-create-first-name"
                      type="text"
                      value={customerForm.first_name}
                      onChange={(e) => setCustomerForm({ ...customerForm, first_name: e.target.value })}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-last-name">
                      Last Name <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="modal-create-last-name"
                      type="text"
                      value={customerForm.last_name}
                      onChange={(e) => setCustomerForm({ ...customerForm, last_name: e.target.value })}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-email">
                      Email Address <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="modal-create-email"
                      type="email"
                      value={customerForm.email}
                      onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-phone">
                      Phone Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="modal-create-phone"
                      type="tel"
                      value={customerForm.phone_number}
                      onChange={(e) => setCustomerForm({ ...customerForm, phone_number: e.target.value })}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-pwd">
                      Account Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <PasswordInput
                      id="modal-create-pwd"
                      placeholder="Create a password"
                      value={createPassword}
                      onChange={(e) => setCreatePassword(e.target.value)}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-create-confirm-pwd">
                      Confirm Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <PasswordInput
                      id="modal-create-confirm-pwd"
                      placeholder="Re-enter password"
                      value={createConfirmPassword}
                      onChange={(e) => setCreateConfirmPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ marginTop: '8px' }}>
                  <PasswordStrengthChecklist password={createPassword} showAlways={Boolean(createPassword)} />
                </div>

                <div className={classes.badgeRow} style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className={classes.primaryBtn}
                    disabled={isCreatingAccount}
                    onClick={() => handleCreateAccountAndComplete(true)}
                  >
                    {isCreatingAccount ? 'Creating Account…' : 'Create Account'}
                  </button>
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={() => setModalView('choice')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* VIEW 3: MODAL SIGN IN */}
            {modalView === 'sign_in' && (
              <div>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#15803d',
                    cursor: 'pointer',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    marginBottom: '8px',
                    padding: 0,
                  }}
                  onClick={() => setModalView('choice')}
                >
                  &larr; Back to options
                </button>
                <h3 style={{ margin: '0 0 4px 0', color: '#174b0f', fontSize: '1.2rem' }}>
                  Sign In
                </h3>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.84rem', color: '#64748b' }}>
                  Sign in with your email or phone number and password to link this reservation to your account.
                </p>

                {signInError && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      backgroundColor: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#dc2626',
                      fontSize: '0.84rem',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {signInError}
                  </div>
                )}

                <div className={classes.formGrid}>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-signin-id">
                      Email Address or Phone Number <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="modal-signin-id"
                      type="text"
                      placeholder="name@example.com or (555) 000-0000"
                      value={signInIdentifier}
                      onChange={(e) => setSignInIdentifier(e.target.value)}
                    />
                  </div>
                  <div className={classes.fieldGroup}>
                    <label htmlFor="modal-signin-pwd">
                      Password <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <PasswordInput
                      id="modal-signin-pwd"
                      placeholder="Enter password"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                    />
                  </div>
                </div>

                <div className={classes.badgeRow} style={{ marginTop: '16px' }}>
                  <button
                    type="button"
                    className={classes.primaryBtn}
                    disabled={isSigningIn}
                    onClick={() => handleSignInAndComplete(true)}
                  >
                    {isSigningIn ? 'Signing In…' : 'Sign In'}
                  </button>
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={() => setModalView('choice')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerBookingPortal;
