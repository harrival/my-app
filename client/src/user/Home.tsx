import React, { useState, useContext, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../shared/Context/auth-context';
import { useUserProfile } from '../shared/Context/UserProfileContext';
import { getResolvedBaseUrl } from '../shared/Utils/apiConfig';
import PasswordStrengthChecklist from '../shared/Authenticate/PasswordStrengthChecklist';
import PasswordInput from '../shared/Authenticate/PasswordInput';
import { evaluatePasswordStrength } from '../shared/Utils/passwordValidation';

export interface BusinessLocationEntry {
  business: string;
  business_name: string;
  country: string;
  state: string;
  city: string;
  physical_address: string;
  contact_phone: string;
  summary: string;
}

const FALLBACK_BUSINESS_DIRECTORY: BusinessLocationEntry[] = [
  {
    business: 'alpha_rentals',
    business_name: 'Alpha Rentals — Downtown Los Angeles',
    country: 'United States',
    state: 'California',
    city: 'Los Angeles',
    physical_address: '100 Enterprise Way, Suite 100, Los Angeles, CA',
    contact_phone: '+1 (800) 555-0101',
    summary: 'Full-service event, audio, and outdoor adventure equipment rentals.'
  },
  {
    business: 'pacific_coast_rentals',
    business_name: 'Pacific Coast Rentals — Santa Monica Pier',
    country: 'United States',
    state: 'California',
    city: 'Los Angeles',
    physical_address: '450 Ocean Ave, Santa Monica, Los Angeles, CA',
    contact_phone: '+1 (800) 555-0102',
    summary: 'Coastal recreational gear, event staging, and family adventure packages.'
  },
  {
    business: 'bay_area_rentals',
    business_name: 'Bay Area Rentals — Market Street',
    country: 'United States',
    state: 'California',
    city: 'San Francisco',
    physical_address: '720 Market St, San Francisco, CA',
    contact_phone: '+1 (800) 555-0103',
    summary: 'Corporate event equipment, lighting rigs, and outdoor recreation rentals.'
  },
  {
    business: 'san_diego_outdoors',
    business_name: 'Harbor View Rentals — Gaslamp Quarter',
    country: 'United States',
    state: 'California',
    city: 'San Diego',
    physical_address: '310 Fifth Ave, San Diego, CA',
    contact_phone: '+1 (800) 555-0104',
    summary: 'Beachfront event production, sound systems, and group recreation.'
  },
  {
    business: 'bravo_rentals',
    business_name: 'Bravo Rentals — Downtown Austin',
    country: 'United States',
    state: 'Texas',
    city: 'Austin',
    physical_address: '210 Congress Ave, Austin, TX',
    contact_phone: '+1 (800) 555-0105',
    summary: 'Live festival sound, stage equipment, and outdoor party rentals.'
  },
  {
    business: 'lone_star_rentals',
    business_name: 'Lone Star Event Rentals — Uptown Dallas',
    country: 'United States',
    state: 'Texas',
    city: 'Dallas',
    physical_address: '1900 McKinney Ave, Dallas, TX',
    contact_phone: '+1 (800) 555-0106',
    summary: 'Commercial event rentals, tents, A/V systems, and interactive games.'
  },
  {
    business: 'beta_rentals',
    business_name: 'Beta Rentals — Midtown Manhattan',
    country: 'United States',
    state: 'New York',
    city: 'New York City',
    physical_address: '500 7th Ave, New York, NY',
    contact_phone: '+1 (800) 555-0107',
    summary: 'Production lighting, pro audio, and metropolitan event equipment.'
  },
  {
    business: 'emerald_city_rentals',
    business_name: 'Emerald City Rentals — Waterfront',
    country: 'United States',
    state: 'Washington',
    city: 'Seattle',
    physical_address: '1400 Alaskan Way, Seattle, WA',
    contact_phone: '+1 (800) 555-0108',
    summary: 'Pacific Northwest outdoor excursions and event equipment rentals.'
  },
  {
    business: 'maple_leaf_rentals',
    business_name: 'Maple Leaf Rentals — Harbourfront',
    country: 'Canada',
    state: 'Ontario',
    city: 'Toronto',
    physical_address: '235 Queens Quay W, Toronto, ON',
    contact_phone: '+1 (800) 555-0109',
    summary: 'Premier Canadian event production and recreational equipment center.'
  },
  {
    business: 'pacific_north_rentals',
    business_name: 'Pacific North Rentals — Coal Harbour',
    country: 'Canada',
    state: 'British Columbia',
    city: 'Vancouver',
    physical_address: '1055 Canada Pl, Vancouver, BC',
    contact_phone: '+1 (800) 555-0110',
    summary: 'Mountain & coastal adventure gear and commercial event rentals.'
  }
];

const Home: React.FC = () => {
  const auth = useContext(AuthContext);
  const {
    profile,
    setProfile,
    refreshProfile,
    isElevatedStaff,
    isAdmin,
    isSupervisor
  } = useUserProfile();
  const navigate = useNavigate();
  const location = useLocation();

  const staffBusiness = profile?.business || 'alpha_rentals';

  // Reservation location finder toggle & drill-down state
  const [showReservationFinder, setShowReservationFinder] = useState<boolean>(false);
  const [directory, setDirectory] = useState<BusinessLocationEntry[]>(FALLBACK_BUSINESS_DIRECTORY);
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [locationErrors, setLocationErrors] = useState<{
    country?: string;
    state?: string;
    city?: string;
  }>({});

  // Account tabs: 'signin' | 'signup'
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Sign-In state
  const [identifier, setIdentifier] = useState<string>('');
  const [signInPassword, setSignInPassword] = useState<string>('');
  const [signInStep, setSignInStep] = useState<
    'lookup' | 'verify_2fa' | 'staff_first_time' | 'staff_password' | 'staff_2fa' | 'customer_password' | 'forgot_password'
  >('lookup');
  const [matchedAccount, setMatchedAccount] = useState<any>(null);
  const [twoFaData, setTwoFaData] = useState<any>(null);
  const [verificationOtp, setVerificationOtp] = useState<string>('');
  const [customerHasPassword, setCustomerHasPassword] = useState<boolean>(true);
  const [maskedPhone, setMaskedPhone] = useState<string>('');

  // First-time staff setup state
  const [staffNewPassword, setStaffNewPassword] = useState<string>('');
  const [staffConfirmPassword, setStaffConfirmPassword] = useState<string>('');
  const [staffSetupOtp, setStaffSetupOtp] = useState<string>('');

  // Returning staff state
  const [staffPassword, setStaffPassword] = useState<string>('');
  const [staff2faOtp, setStaff2faOtp] = useState<string>('');

  // Forgot password / reset state
  const [resetIdentifier, setResetIdentifier] = useState<string>('');
  const [resetOtp, setResetOtp] = useState<string>('');
  const [resetStep, setResetStep] = useState<'enter_code' | 'set_password'>('enter_code');
  const [resetToken, setResetToken] = useState<string>('');
  const [resetNewPassword, setResetNewPassword] = useState<string>('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState<string>('');
  const [devPin, setDevPin] = useState<string>('');

  // Customer Password state
  const [customerPassword, setCustomerPassword] = useState<string>('');

  // Sign-Up state (personal customer info only — not tied to a business)
  const [signUpFirstName, setSignUpFirstName] = useState<string>('');
  const [signUpLastName, setSignUpLastName] = useState<string>('');
  const [signUpEmail, setSignUpEmail] = useState<string>('');
  const [signUpPhone, setSignUpPhone] = useState<string>('');
  const [signUpPassword, setSignUpPassword] = useState<string>('');
  const [signUpSmsOptIn, setSignUpSmsOptIn] = useState<boolean>(true);

  // UI feedback
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string>('');

  // Open reservation finder automatically if navigated with ?reservations=1 or #reservations
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('reservations') === '1' || location.hash === '#reservations') {
      setShowReservationFinder(true);
      setTimeout(() => {
        const section = document.getElementById('reservations');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        if (!selectedCountry) {
          document.getElementById('filter-country')?.focus();
        } else if (!selectedState) {
          document.getElementById('filter-state')?.focus();
        } else if (!selectedCity) {
          document.getElementById('filter-city')?.focus();
        }
      }, 150);
    }
  }, [location.search, location.hash, selectedCountry, selectedState, selectedCity]);

  // Load business directory from server
  useEffect(() => {
    let mounted = true;
    const loadDirectory = async () => {
      try {
        const currentApiUrl = getResolvedBaseUrl();
        const res = await axios.get(`${currentApiUrl}/api/directory/businesses`);
        if (mounted && Array.isArray(res.data?.businesses) && res.data.businesses.length > 0) {
          setDirectory(res.data.businesses);
        }
      } catch {
        // Keep fallback directory if offline
      }
    };
    loadDirectory();
    return () => {
      mounted = false;
    };
  }, []);

  // Drill-down options: Country -> State -> City -> Businesses around the city
  const countries = useMemo(() => {
    return Array.from(new Set(directory.map((b) => b.country))).sort();
  }, [directory]);

  const states = useMemo(() => {
    if (!selectedCountry) return [];
    return Array.from(
      new Set(
        directory
          .filter((b) => b.country === selectedCountry)
          .map((b) => b.state)
      )
    ).sort();
  }, [directory, selectedCountry]);

  const cities = useMemo(() => {
    if (!selectedCountry || !selectedState) return [];
    return Array.from(
      new Set(
        directory
          .filter((b) => b.country === selectedCountry && b.state === selectedState)
          .map((b) => b.city)
      )
    ).sort();
  }, [directory, selectedCountry, selectedState]);

  const businessesInCity = useMemo(() => {
    if (!selectedCountry || !selectedState || !selectedCity) return [];
    return directory.filter(
      (b) =>
        b.country === selectedCountry &&
        b.state === selectedState &&
        b.city === selectedCity
    );
  }, [directory, selectedCountry, selectedState, selectedCity]);

  const handleCountryChange = (country: string) => {
    setSelectedCountry(country);
    setSelectedState('');
    setSelectedCity('');
    if (locationErrors.country) {
      setLocationErrors((prev) => ({ ...prev, country: '' }));
    }
    if (country) {
      setTimeout(() => {
        document.getElementById('filter-state')?.focus();
      }, 100);
    }
  };

  const handleStateChange = (stateVal: string) => {
    setSelectedState(stateVal);
    setSelectedCity('');
    if (locationErrors.state) {
      setLocationErrors((prev) => ({ ...prev, state: '' }));
    }
    if (stateVal) {
      setTimeout(() => {
        document.getElementById('filter-city')?.focus();
      }, 100);
    }
  };

  const handleCityChange = (cityVal: string) => {
    setSelectedCity(cityVal);
    if (locationErrors.city) {
      setLocationErrors((prev) => ({ ...prev, city: '' }));
    }
  };

  const handleMakeReservationClick = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setShowReservationFinder(true);
    setLocationErrors({});

    // Smoothly scroll and direct user directly to the filter section
    setTimeout(() => {
      const section = document.getElementById('reservations');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      // Focus the first empty filter field
      if (!selectedCountry) {
        document.getElementById('filter-country')?.focus();
      } else if (!selectedState) {
        document.getElementById('filter-state')?.focus();
      } else if (!selectedCity) {
        document.getElementById('filter-city')?.focus();
      }
    }, 100);
  };

  const resetSignInFlow = () => {
    setSignInStep('lookup');
    setMatchedAccount(null);
    setTwoFaData(null);
    setVerificationOtp('');
    setSignInPassword('');
    setMaskedPhone('');
    setStaffNewPassword('');
    setStaffConfirmPassword('');
    setStaffSetupOtp('');
    setStaffPassword('');
    setStaff2faOtp('');
    setResetIdentifier('');
    setResetOtp('');
    setResetStep('enter_code');
    setResetToken('');
    setResetNewPassword('');
    setResetConfirmPassword('');
    setCustomerPassword('');
    setDevPin('');
    setError('');
    setInfoMessage('');
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Please enter your phone number or email.');
      return;
    }

    if (!signInPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/login`, {
        identifier: trimmed,
        password: signInPassword
      });

      const data = res.data;

      if (data?.require_2fa || data?.requires_2fa) {
        setTwoFaData({
          identifier: trimmed,
          user_guid: data.user_guid,
          customer_guid: data.customer_guid,
          source: data.source,
          masked_phone: data.masked_phone
        });
        setMaskedPhone(data.masked_phone || '');
        if (data.dev_pin) {
          console.log('====================================================');
          console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT VERIFICATION PIN:`, data.dev_pin);
          console.log(`   Account:`, trimmed);
          console.log('====================================================');
          setDevPin(data.dev_pin);
        }
        setSignInStep('verify_2fa');
        setVerificationOtp('');
        setInfoMessage(
          data.message ||
            `Credentials verified! Enter the 6-digit verification code sent to ${data.masked_phone ? data.masked_phone : 'your phone/email'}.`
        );
      } else if (data?.profile) {
        await refreshProfile(data.profile.user_guid);
        auth.login();
        if (data.profile.permission_group && data.profile.permission_group.toLowerCase() !== 'customer') {
          navigate(`/${data.profile.business || 'alpha_rentals'}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }
    } catch (err: any) {
      if (err?.response?.data?.is_first_time) {
        setSignInStep('staff_first_time');
        if (err.response.data.dev_pin) {
          setDevPin(err.response.data.dev_pin);
        }
        if (err.response.data.masked_phone) {
          setMaskedPhone(err.response.data.masked_phone);
        }
        setInfoMessage(err.response.data.error || 'Welcome! Please set up your password.');
      } else {
        setError(err?.response?.data?.error || 'Invalid email/phone or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const trimmedOtp = verificationOtp.trim();
    if (!trimmedOtp || trimmedOtp.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/verify-2fa`, {
        identifier: twoFaData?.identifier || identifier.trim(),
        otp: trimmedOtp,
        user_guid: twoFaData?.user_guid,
        customer_guid: twoFaData?.customer_guid,
        source: twoFaData?.source
      });

      const profileData = res.data?.profile;
      if (profileData?.user_guid) {
        await refreshProfile(profileData.user_guid);
        auth.login();
        if (profileData.permission_group && profileData.permission_group.toLowerCase() !== 'customer') {
          navigate(`/${profileData.business || 'alpha_rentals'}`, { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid or expired verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffFirstTimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!staffNewPassword) {
      setError('Please create a password.');
      return;
    }

    const strength = evaluatePasswordStrength(staffNewPassword);
    if (!strength.isValid) {
      setError(`Password requirement: ${strength.errors[0]}`);
      return;
    }

    if (staffNewPassword !== staffConfirmPassword) {
      setError('Passwords do not match. Please verify both passwords.');
      return;
    }

    if (!staffSetupOtp || staffSetupOtp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code sent to your phone.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/staff/setup-password`, {
        identifier: identifier.trim(),
        user_guid: matchedAccount?.user_guid,
        password: staffNewPassword,
        otp: staffSetupOtp.trim()
      });

      const profileData = res.data?.profile || matchedAccount;
      if (profileData?.user_guid) {
        await refreshProfile(profileData.user_guid);
        auth.login();
        const targetBiz = profileData.business || 'alpha_rentals';
        navigate(`/${targetBiz}`, { replace: true });
      } else {
        setError('Could not complete setup. Please try again.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Unable to set password. Please check your verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!staffPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/staff/login`, {
        identifier: identifier.trim(),
        password: staffPassword
      });

      if (res.data?.require_2fa || res.data?.requires_2fa) {
        setSignInStep('staff_2fa');
        setStaff2faOtp('');
        setMaskedPhone(res.data.masked_phone || maskedPhone);
        if (res.data.dev_pin) {
          console.log('====================================================');
          console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT STAFF 2FA PIN:`, res.data.dev_pin);
          console.log(`   Account:`, identifier);
          console.log('====================================================');
          setDevPin(res.data.dev_pin);
        }
        setInfoMessage(res.data.message || 'Password verified! Enter the 6-digit verification code sent to your phone.');
      } else if (res.data?.profile) {
        await refreshProfile(res.data.profile.user_guid);
        auth.login();
        navigate(`/${res.data.profile.business || 'alpha_rentals'}`, { replace: true });
      }
    } catch (err: any) {
      if (err?.response?.data?.is_first_time) {
        setSignInStep('staff_first_time');
        setInfoMessage(err.response.data.error);
      } else {
        setError(err?.response?.data?.error || 'Invalid password. Please try again or reset your password.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStaff2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!staff2faOtp || staff2faOtp.trim().length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/staff/verify-2fa`, {
        identifier: identifier.trim(),
        user_guid: matchedAccount?.user_guid,
        otp: staff2faOtp.trim()
      });

      const profileData = res.data?.profile || matchedAccount;
      if (profileData?.user_guid) {
        await refreshProfile(profileData.user_guid);
        auth.login();
        const targetBiz = profileData.business || 'alpha_rentals';
        navigate(`/${targetBiz}`, { replace: true });
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid or expired verification code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordRequest = async (targetIdent?: string) => {
    const ident = (targetIdent || resetIdentifier || identifier).trim();
    if (!ident) {
      setError('Please enter your email address or phone number to reset your password.');
      return;
    }

    setResetIdentifier(ident);
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/forgot-password`, {
        identifier: ident
      });

      setMaskedPhone(res.data?.masked_phone || '');
      setSignInStep('forgot_password');
      setResetStep('enter_code');
      setResetToken('');
      setResetOtp('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      if (res.data?.dev_pin) {
        console.log('====================================================');
        console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT PASSWORD RESET PIN:`, res.data.dev_pin);
        console.log(`   Account:`, ident);
        console.log('====================================================');
        setDevPin(res.data.dev_pin);
      }
      setInfoMessage(
        res.data?.message ||
          'A 6-digit verification code has been dispatched. Enter the code below to verify your identity.'
      );
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Unable to request password reset. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyResetCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMessage('');

    const code = resetOtp.trim();
    if (!code || code.length !== 6) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/verify-reset-code`, {
        identifier: resetIdentifier.trim(),
        otp: code
      });

      if (res.data?.reset_token) {
        setResetToken(res.data.reset_token);
      }
      setResetStep('set_password');
      setInfoMessage('Identity verified successfully! Please enter and confirm your new password below.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid or expired verification code. Please check the code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!resetNewPassword) {
      setError('Please enter a new password.');
      return;
    }

    const strength = evaluatePasswordStrength(resetNewPassword);
    if (!strength.isValid) {
      setError(`Password requirement: ${strength.errors[0]}`);
      return;
    }

    if (resetNewPassword !== resetConfirmPassword) {
      setError('Passwords do not match. Please verify both passwords.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/reset-password`, {
        identifier: resetIdentifier.trim(),
        otp: resetOtp.trim(),
        reset_token: resetToken,
        new_password: resetNewPassword
      });

      const loggedInProfile = res.data?.profile;
      if (loggedInProfile?.user_guid) {
        await refreshProfile(loggedInProfile.user_guid);
        auth.login();
        resetSignInFlow();
        if (loggedInProfile.permission_group && loggedInProfile.permission_group.toLowerCase() !== 'customer') {
          navigate(`/${loggedInProfile.business || 'alpha_rentals'}`, { replace: true });
        } else {
          setShowReservationFinder(true);
          navigate('/', { replace: true });
        }
      } else {
        setInfoMessage(
          res.data?.message || 'Password reset successfully! Please sign in with your new password.'
        );
        resetSignInFlow();
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Unable to reset password. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async (purpose: 'staff_first_time' | 'staff_2fa' | 'password_reset' | 'verify_2fa' | string) => {
    let ident = (purpose === 'password_reset' ? resetIdentifier : (twoFaData?.identifier || identifier)).trim();
    let targetPurpose = purpose;
    if (purpose === 'verify_2fa' || purpose === '2fa') {
      targetPurpose = twoFaData?.source === 'customers' ? 'customer_2fa' : 'staff_2fa';
    }

    if (!ident) {
      setError('Identifier is missing. Please restart sign in.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/resend-otp`, {
        identifier: ident,
        purpose: targetPurpose
      });
      if (res.data?.dev_pin) {
        console.log('====================================================');
        console.log(`📱 [DEV OTP CONSOLE] 🔐 6-DIGIT PIN (${targetPurpose}):`, res.data.dev_pin);
        console.log(`   Account:`, ident);
        console.log('====================================================');
        setDevPin(res.data.dev_pin);
      }
      setInfoMessage(res.data?.message || 'A fresh 6-digit verification code has been dispatched.');
      if (res.data?.masked_phone) {
        setMaskedPhone(res.data.masked_phone);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not resend code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!customerPassword) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/customer/login`, {
        customer_guid: matchedAccount?.customer_guid || matchedAccount?.user_guid,
        identifier: identifier.trim(),
        password: customerPassword
      });

      const loggedInProfile = res.data?.profile;
      if (loggedInProfile?.user_guid) {
        await refreshProfile(loggedInProfile.user_guid);
        auth.login();
        setShowReservationFinder(true);
      } else {
        setError('Unable to complete sign in. Please try again.');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Invalid password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomerSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const cleanDigits = signUpPhone.replace(/\D/g, '');
    const dbPhone = cleanDigits.length === 11 && cleanDigits.startsWith('1') ? cleanDigits.slice(1) : cleanDigits;

    if (!signUpFirstName.trim() || !signUpLastName.trim() || !signUpEmail.trim() || !dbPhone || !signUpPassword) {
      setError('Please fill in all required fields.');
      return;
    }

    if (dbPhone.length !== 10) {
      setError('Please enter a valid 10-digit phone number.');
      return;
    }

    const pwdStrength = evaluatePasswordStrength(signUpPassword);
    if (!pwdStrength.isValid) {
      setError(`Password requirement: ${pwdStrength.errors[0]}`);
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post(`${currentApiUrl}/auth/customer/signup`, {
        first_name: signUpFirstName.trim(),
        last_name: signUpLastName.trim(),
        email: signUpEmail.trim().toLowerCase(),
        phone_number: dbPhone,
        password: signUpPassword,
        sms_opt_in: signUpSmsOptIn
      });

      const createdProfile = res.data?.profile;
      if (createdProfile?.user_guid) {
        await refreshProfile(createdProfile.user_guid);
        auth.login();
        setShowReservationFinder(true);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not create your account. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    try {
      if (profile?.user_guid) {
        const currentApiUrl = getResolvedBaseUrl();
        await axios.post(`${currentApiUrl}/profile/${profile.user_guid}`, {});
      }
    } catch {
      // Ignore sign-out network errors
    } finally {
      localStorage.removeItem('userSession');
      setProfile(null);
      auth.logout();
      resetSignInFlow();
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '1.5rem auto', padding: '0 1rem' }}>
      {/* Location Drill-Down Filter (Revealed when clicking the Reservations link) */}
      {showReservationFinder && (
        <div
          id="reservations"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '1.75rem',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.08)',
            border: '1px solid #dce6d9',
            marginBottom: '1.75rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.35rem', color: '#174b0f' }}>
                Find a Location to Book Your Reservation
              </h2>
              <p style={{ margin: '0.35rem 0 0 0', color: '#475569', fontSize: '0.92rem' }}>
                Select your country, state or province, and city to view businesses near you.
              </p>
            </div>
            {(selectedCountry || selectedState || selectedCity) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCountry('');
                  setSelectedState('');
                  setSelectedCity('');
                  setLocationErrors({});
                }}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#f8fafc',
                  color: '#475569',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Reset Filters
              </button>
            )}
          </div>

          {(locationErrors.country || locationErrors.state || locationErrors.city) && (
            <div
              style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: '8px',
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.88rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span>
              <span>Please select your Country, State / Province, and City to complete the reservation form.</span>
            </div>
          )}

          {/* 3-Step Location Filter: Country -> State -> City */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '1rem',
              marginBottom: '1.25rem'
            }}
          >
            <div>
              <label
                htmlFor="filter-country"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.35rem' }}
              >
                1. Country <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="filter-country"
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '8px',
                  border: locationErrors.country ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '0.94rem',
                  backgroundColor: '#ffffff',
                  color: '#1e293b'
                }}
              >
                <option value="">Select Country...</option>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
              {locationErrors.country && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {locationErrors.country}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="filter-state"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.35rem' }}
              >
                2. State / Province <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="filter-state"
                value={selectedState}
                onChange={(e) => handleStateChange(e.target.value)}
                disabled={!selectedCountry}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '8px',
                  border: locationErrors.state ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '0.94rem',
                  backgroundColor: selectedCountry ? '#ffffff' : '#f1f5f9',
                  color: '#1e293b',
                  cursor: selectedCountry ? 'pointer' : 'not-allowed'
                }}
              >
                <option value="">
                  {selectedCountry ? 'Select State / Province...' : 'Select a country first'}
                </option>
                {states.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              {locationErrors.state && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {locationErrors.state}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="filter-city"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.35rem' }}
              >
                3. City <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                id="filter-city"
                value={selectedCity}
                onChange={(e) => handleCityChange(e.target.value)}
                disabled={!selectedState}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '8px',
                  border: locationErrors.city ? '1.5px solid #ef4444' : '1px solid #cbd5e1',
                  fontSize: '0.94rem',
                  backgroundColor: selectedState ? '#ffffff' : '#f1f5f9',
                  color: '#1e293b',
                  cursor: selectedState ? 'pointer' : 'not-allowed'
                }}
              >
                <option value="">
                  {selectedState ? 'Select City...' : 'Select a state first'}
                </option>
                {cities.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
              {locationErrors.city && (
                <p style={{ margin: '4px 0 0', color: '#dc2626', fontSize: '0.82rem', fontWeight: 600 }}>
                  {locationErrors.city}
                </p>
              )}
            </div>
          </div>

          {/* Businesses Around the Selected City */}
          {selectedCity ? (
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.75rem' }}>
                Businesses in and around {selectedCity}, {selectedState} ({businessesInCity.length})
              </div>
              {businessesInCity.length === 0 ? (
                <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', color: '#64748b', fontSize: '0.92rem' }}>
                  No participating businesses were found in {selectedCity}. Please try another city.
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '1rem'
                  }}
                >
                  {businessesInCity.map((biz) => (
                    <div
                      key={biz.business}
                      onClick={() => navigate(`/book/${encodeURIComponent(biz.business)}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          navigate(`/book/${encodeURIComponent(biz.business)}`);
                        }
                      }}
                      style={{
                        padding: '1.2rem',
                        borderRadius: '12px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.75rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.05rem', color: '#174b0f', marginBottom: '0.3rem' }}>
                          📍 {biz.physical_address || `${biz.city}, ${biz.state}`}
                        </div>
                        <div style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '0.4rem', lineHeight: 1.45 }}>
                          {biz.summary}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          {biz.city}, {biz.state}, {biz.country}
                        </div>
                        {biz.contact_phone && (
                          <div style={{ fontSize: '0.82rem', color: '#64748b', marginTop: '0.2rem' }}>
                            📞 {biz.contact_phone}
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          marginTop: '0.25rem',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          color: '#174b0f',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span>Continue to Booking Page</span>
                        <span>→</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div
              style={{
                padding: '1rem 1.15rem',
                borderRadius: '10px',
                backgroundColor: '#f8fafc',
                border: '1px dashed #cbd5e1',
                color: '#64748b',
                fontSize: '0.9rem'
              }}
            >
              Choose a <strong>Country</strong>, <strong>State / Province</strong>, and <strong>City</strong> above to view participating businesses around your location.
            </div>
          )}
        </div>
      )}

      {/* Main Content Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: '1.5rem',
          alignItems: 'start'
        }}
      >
        {/* Left Card: Reservations Quick Access */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '1.75rem',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.06)',
            border: '1px solid #e2e8f0'
          }}
        >
          <h2 style={{ margin: '0 0 0.65rem 0', color: '#174b0f', fontSize: '1.25rem' }}>
            Online Reservations
          </h2>
          <p style={{ margin: '0 0 1.25rem 0', color: '#475569', fontSize: '0.94rem', lineHeight: 1.55 }}>
            Your account works across all participating locations. Click the reservation link below to filter by country, state, and city, then select a business near you to book or manage a reservation.
          </p>
          <a
            href="#reservations"
            onClick={handleMakeReservationClick}
            style={{
              display: 'inline-block',
              padding: '0.75rem 1.25rem',
              borderRadius: '8px',
              backgroundColor: '#174b0f',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.92rem',
              textDecoration: 'none',
              cursor: 'pointer'
            }}
          >
            Make a Reservation →
          </a>
        </div>

        {/* Right Card: Account Sign In / Create Account or Signed-In Summary */}
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '14px',
            padding: '1.75rem',
            boxShadow: '0 4px 18px rgba(0, 0, 0, 0.08)',
            border: '1px solid #e2e8f0'
          }}
        >
          {auth.isLoggedIn && profile ? (
            <div>
              <div style={{ marginBottom: '1rem' }}>
                <h2 style={{ margin: 0, fontSize: '1.3rem', color: '#1e293b' }}>
                  Welcome back, {profile.first_name} {profile.last_name}
                </h2>
                <p style={{ margin: '0.35rem 0 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                  {profile.email ? profile.email : ''}
                  {profile.email && profile.phone_number ? ' • ' : ''}
                  {profile.phone_number ? profile.phone_number : ''}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleMakeReservationClick}
                  style={{
                    padding: '0.8rem 1rem',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#174b0f',
                    color: '#ffffff',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.95rem'
                  }}
                >
                  Find a Location &amp; Book a Reservation
                </button>

                {isElevatedStaff && (
                  <button
                    type="button"
                    onClick={() => navigate(`/${staffBusiness}`)}
                    style={{
                      padding: '0.8rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #174b0f',
                      backgroundColor: '#f0fdf4',
                      color: '#174b0f',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.95rem'
                    }}
                  >
                    Open Staff Workspace ({isAdmin || isSupervisor ? 'Business Manager' : 'Player Builder'})
                  </button>
                )}

                {isElevatedStaff && (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/${staffBusiness}`)}
                    style={{
                      padding: '0.8rem 1rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f8fafc',
                      color: '#1e293b',
                      fontWeight: 600,
                      cursor: 'pointer',
                      fontSize: '0.92rem'
                    }}
                  >
                    Open {isAdmin ? 'Admin' : 'Business Owner'} Control Panel
                  </button>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`/${staffBusiness}/Profile`)}
                    style={{
                      flex: 1,
                      padding: '0.7rem',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#ffffff',
                      color: '#334155',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    My Profile
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '0.7rem',
                      borderRadius: '8px',
                      border: '1px solid #fecaca',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {loading ? 'Signing Out...' : 'Sign Out'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              {/* Tabs: Sign In vs Create Account */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  backgroundColor: '#f1f5f9',
                  padding: '4px',
                  borderRadius: '10px',
                  marginBottom: '1.25rem'
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signin');
                    setError('');
                    setInfoMessage('');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'signin' ? '#ffffff' : 'transparent',
                    color: activeTab === 'signin' ? '#174b0f' : '#64748b',
                    boxShadow: activeTab === 'signin' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('signup');
                    setError('');
                    setInfoMessage('');
                  }}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 700,
                    fontSize: '0.92rem',
                    cursor: 'pointer',
                    backgroundColor: activeTab === 'signup' ? '#ffffff' : 'transparent',
                    color: activeTab === 'signup' ? '#174b0f' : '#64748b',
                    boxShadow: activeTab === 'signup' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none'
                  }}
                >
                  Create Account
                </button>
              </div>

              {error && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    marginBottom: '1rem'
                  }}
                >
                  {error}
                </div>
              )}

              {infoMessage && (
                <div
                  style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    padding: '0.75rem 1rem',
                    borderRadius: '8px',
                    fontSize: '0.88rem',
                    fontWeight: 500,
                    marginBottom: '1rem'
                  }}
                >
                  {infoMessage}
                </div>
              )}

              {/* TAB 1: SIGN IN */}
              {activeTab === 'signin' && (
                <>
                  {signInStep === 'lookup' && (
                    <form onSubmit={handleSignInSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor="home-login-identifier"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', fontSize: '0.92rem', marginBottom: '0.4rem' }}
                        >
                          Phone Number or Email
                        </label>
                        <input
                          id="home-login-identifier"
                          type="text"
                          placeholder="Enter your phone number or email"
                          value={identifier}
                          onChange={(e) => setIdentifier(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem 0.9rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.95rem',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '1.25rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <label
                            htmlFor="home-login-password"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.92rem' }}
                          >
                            Password
                          </label>
                          <button
                            type="button"
                            onClick={() => handleForgotPasswordRequest(identifier)}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#174b0f',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <PasswordInput
                          id="home-login-password"
                          placeholder="Enter your password"
                          value={signInPassword}
                          onChange={(e) => setSignInPassword(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '0.8rem',
                          borderRadius: '8px',
                          border: 'none',
                          backgroundColor: '#174b0f',
                          color: '#ffffff',
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          cursor: loading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {loading ? 'Verifying...' : 'Sign In'}
                      </button>
                    </form>
                  )}

                  {/* 2FA VERIFICATION CODE STEP (Shown only after correct email/phone + password) */}
                  {signInStep === 'verify_2fa' && (
                    <form onSubmit={handleVerify2faSubmit}>
                      <div
                        style={{
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          color: '#166534',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          marginBottom: '1rem'
                        }}
                      >
                        <strong>Two-Factor Verification:</strong> Enter the 6-digit verification code sent to {maskedPhone ? `(${maskedPhone})` : 'your registered phone/email'}.
                      </div>

                      {devPin && (
                        <div
                          style={{
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #10b981',
                            color: '#065f46',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            fontSize: '0.88rem',
                            fontWeight: 'bold',
                            marginBottom: '1rem',
                            textAlign: 'center'
                          }}
                        >
                          🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.15rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                        </div>
                      )}

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label
                            htmlFor="home-verification-otp"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}
                          >
                            6-Digit Verification Code *
                          </label>
                          <button
                            type="button"
                            onClick={() => handleResendOtp('verify_2fa')}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#174b0f',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Resend Code
                          </button>
                        </div>
                        <input
                          id="home-verification-otp"
                          type="text"
                          maxLength={6}
                          placeholder="123456"
                          value={verificationOtp}
                          onChange={(e) => setVerificationOtp(e.target.value.replace(/\D/g, ''))}
                          disabled={loading}
                          required
                          autoFocus
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '2px solid #174b0f',
                            fontSize: '1.2rem',
                            letterSpacing: '0.3rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <button
                          type="submit"
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Verifying...' : 'Verify & Sign In'}
                        </button>
                        <button
                          type="button"
                          onClick={resetSignInFlow}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ← Back to Sign In
                        </button>
                      </div>
                    </form>
                  )}

                  {/* STAFF FIRST-TIME SETUP */}
                  {signInStep === 'staff_first_time' && (
                    <form onSubmit={handleStaffFirstTimeSubmit}>
                      <div
                        style={{
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          color: '#166534',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          marginBottom: '1rem'
                        }}
                      >
                        <strong>First-Time Staff Setup:</strong> Set a secure password and enter the 6-digit code sent to your phone {maskedPhone ? `(${maskedPhone})` : ''}.
                      </div>

                      {devPin && (
                        <div
                          style={{
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #10b981',
                            color: '#065f46',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            fontSize: '0.88rem',
                            fontWeight: 'bold',
                            marginBottom: '1rem',
                            textAlign: 'center'
                          }}
                        >
                          🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.15rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                        </div>
                      )}

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label
                          htmlFor="home-staff-new-pwd"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.88rem' }}
                        >
                          New Password *
                        </label>
                        <PasswordInput
                          id="home-staff-new-pwd"
                          placeholder="Create strong password"
                          value={staffNewPassword}
                          onChange={(e) => setStaffNewPassword(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            padding: '0.7rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.92rem'
                          }}
                        />
                        <PasswordStrengthChecklist password={staffNewPassword} />
                      </div>

                      <div style={{ marginBottom: '0.75rem' }}>
                        <label
                          htmlFor="home-staff-confirm-pwd"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.88rem' }}
                        >
                          Confirm Password *
                        </label>
                        <PasswordInput
                          id="home-staff-confirm-pwd"
                          placeholder="Confirm your password"
                          value={staffConfirmPassword}
                          onChange={(e) => setStaffConfirmPassword(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            padding: '0.7rem 0.85rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.92rem'
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label
                            htmlFor="home-staff-setup-otp"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}
                          >
                            6-Digit Verification Code *
                          </label>
                          <button
                            type="button"
                            onClick={() => handleResendOtp('staff_first_time')}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#174b0f',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Resend Code
                          </button>
                        </div>
                        <input
                          id="home-staff-setup-otp"
                          type="text"
                          maxLength={6}
                          placeholder="123456"
                          value={staffSetupOtp}
                          onChange={(e) => setStaffSetupOtp(e.target.value.replace(/\D/g, ''))}
                          disabled={loading}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '2px solid #174b0f',
                            fontSize: '1.2rem',
                            letterSpacing: '0.3rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <button
                          type="submit"
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Setting Password...' : 'Save Password & Sign In'}
                        </button>
                        <button
                          type="button"
                          onClick={resetSignInFlow}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ← Back
                        </button>
                      </div>
                    </form>
                  )}

                  {/* STAFF PASSWORD */}
                  {signInStep === 'staff_password' && (
                    <form onSubmit={handleStaffPasswordSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <label
                            htmlFor="home-staff-password"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.92rem' }}
                          >
                            Staff Password
                          </label>
                          <button
                            type="button"
                            onClick={() => handleForgotPasswordRequest(identifier)}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#174b0f',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Forgot Password?
                          </button>
                        </div>
                        <PasswordInput
                          id="home-staff-password"
                          placeholder="Enter your password"
                          value={staffPassword}
                          onChange={(e) => setStaffPassword(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <button
                          type="submit"
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Verifying...' : 'Continue'}
                        </button>
                        <button
                          type="button"
                          onClick={resetSignInFlow}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ← Back
                        </button>
                      </div>
                    </form>
                  )}

                  {/* STAFF 2FA */}
                  {signInStep === 'staff_2fa' && (
                    <form onSubmit={handleStaff2faSubmit}>
                      <div
                        style={{
                          backgroundColor: '#f0fdf4',
                          border: '1px solid #bbf7d0',
                          color: '#166534',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.85rem',
                          marginBottom: '1rem'
                        }}
                      >
                        <strong>Two-Factor Authentication:</strong> Enter the 6-digit code sent to your phone {maskedPhone ? `(${maskedPhone})` : ''}.
                      </div>

                      {devPin && (
                        <div
                          style={{
                            backgroundColor: '#ecfdf5',
                            border: '1px solid #10b981',
                            color: '#065f46',
                            padding: '0.6rem 0.8rem',
                            borderRadius: '8px',
                            fontSize: '0.88rem',
                            fontWeight: 'bold',
                            marginBottom: '1rem',
                            textAlign: 'center'
                          }}
                        >
                          🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.15rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                        </div>
                      )}

                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                          <label
                            htmlFor="home-staff-2fa-otp"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}
                          >
                            6-Digit Verification Code *
                          </label>
                          <button
                            type="button"
                            onClick={() => handleResendOtp('staff_2fa')}
                            disabled={loading}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: '#174b0f',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              padding: 0
                            }}
                          >
                            Resend Code
                          </button>
                        </div>
                        <input
                          id="home-staff-2fa-otp"
                          type="text"
                          maxLength={6}
                          placeholder="123456"
                          value={staff2faOtp}
                          onChange={(e) => setStaff2faOtp(e.target.value.replace(/\D/g, ''))}
                          disabled={loading}
                          required
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '2px solid #174b0f',
                            fontSize: '1.2rem',
                            letterSpacing: '0.3rem',
                            textAlign: 'center',
                            fontWeight: 700,
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <button
                          type="submit"
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Verifying...' : 'Verify & Sign In'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignInStep('staff_password')}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ← Back to Password
                        </button>
                      </div>
                    </form>
                  )}

                  {/* CUSTOMER PASSWORD */}
                  {signInStep === 'customer_password' && (
                    <form onSubmit={handleCustomerPasswordSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                          <label
                            htmlFor="home-customer-password"
                            style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.92rem' }}
                          >
                            {customerHasPassword ? 'Password' : 'Create Password'}
                          </label>
                          {customerHasPassword && (
                            <button
                              type="button"
                              onClick={() => handleForgotPasswordRequest(identifier)}
                              disabled={loading}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#174b0f',
                                fontSize: '0.82rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: 0
                              }}
                            >
                              Forgot Password?
                            </button>
                          )}
                        </div>
                        <PasswordInput
                          id="home-customer-password"
                          placeholder="Enter your password"
                          value={customerPassword}
                          onChange={(e) => setCustomerPassword(e.target.value)}
                          disabled={loading}
                          required
                          style={{
                            padding: '0.75rem 0.9rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            fontSize: '0.95rem'
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        <button
                          type="submit"
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading ? 'not-allowed' : 'pointer'
                          }}
                        >
                          {loading ? 'Signing In...' : 'Sign In'}
                        </button>
                        <button
                          type="button"
                          onClick={resetSignInFlow}
                          disabled={loading}
                          style={{
                            width: '100%',
                            padding: '0.7rem',
                            borderRadius: '8px',
                            border: '1px solid #cbd5e1',
                            backgroundColor: '#ffffff',
                            color: '#475569',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ← Back
                        </button>
                      </div>
                    </form>
                  )}

                  {/* FORGOT PASSWORD */}
                  {signInStep === 'forgot_password' && (
                    <>
                      {/* STEP 1: VERIFY 6-DIGIT CODE */}
                      {resetStep === 'enter_code' && (
                        <form onSubmit={handleVerifyResetCode}>
                          <div
                            style={{
                              backgroundColor: '#fef3c7',
                              border: '1px solid #fde68a',
                              color: '#92400e',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.85rem',
                              marginBottom: '1rem'
                            }}
                          >
                            <strong>Step 1 of 2:</strong> Enter the 6-digit code sent to {maskedPhone ? `(${maskedPhone})` : 'your phone/email'} to verify your identity.
                          </div>

                          {devPin && (
                            <div
                              style={{
                                backgroundColor: '#ecfdf5',
                                border: '1px solid #10b981',
                                color: '#065f46',
                                padding: '0.6rem 0.8rem',
                                borderRadius: '8px',
                                fontSize: '0.88rem',
                                fontWeight: 'bold',
                                marginBottom: '1rem',
                                textAlign: 'center'
                              }}
                            >
                              🔐 DEV PIN (CONSOLE LOGGED): <span style={{ fontSize: '1.15rem', letterSpacing: '2px', color: '#047857' }}>{devPin}</span>
                            </div>
                          )}

                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                              <label
                                htmlFor="home-reset-otp"
                                style={{ fontWeight: 600, color: '#1e293b', fontSize: '0.88rem' }}
                              >
                                6-Digit Reset Code *
                              </label>
                              <button
                                type="button"
                                onClick={() => handleResendOtp('password_reset')}
                                disabled={loading}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#174b0f',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  padding: 0
                                }}
                              >
                                Resend Code
                              </button>
                            </div>
                            <input
                              id="home-reset-otp"
                              type="text"
                              maxLength={6}
                              placeholder="123456"
                              value={resetOtp}
                              onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                              disabled={loading}
                              required
                              autoFocus
                              style={{
                                width: '100%',
                                padding: '0.75rem',
                                borderRadius: '8px',
                                border: '2px solid #b45309',
                                fontSize: '1.2rem',
                                letterSpacing: '0.3rem',
                                textAlign: 'center',
                                fontWeight: 700,
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <button
                              type="submit"
                              disabled={loading || resetOtp.length !== 6}
                              style={{
                                width: '100%',
                                padding: '0.8rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#174b0f',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: (loading || resetOtp.length !== 6) ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {loading ? 'Verifying Code...' : 'Verify Code'}
                            </button>
                            <button
                              type="button"
                              onClick={resetSignInFlow}
                              disabled={loading}
                              style={{
                                width: '100%',
                                padding: '0.7rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              ← Back to Sign In
                            </button>
                          </div>
                        </form>
                      )}

                      {/* STEP 2: SET NEW PASSWORD (Revealed ONLY after identity verification!) */}
                      {resetStep === 'set_password' && (
                        <form onSubmit={handleResetPasswordSubmit}>
                          <div
                            style={{
                              backgroundColor: '#f0fdf4',
                              border: '1px solid #bbf7d0',
                              color: '#166534',
                              padding: '0.75rem',
                              borderRadius: '8px',
                              fontSize: '0.85rem',
                              marginBottom: '1rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}
                          >
                            <span style={{ fontSize: '1.2rem' }}>✓</span>
                            <div>
                              <strong>Step 2 of 2:</strong> Code verified! Now create your new password (cannot be your last password).
                            </div>
                          </div>

                          <div style={{ marginBottom: '0.75rem' }}>
                            <label
                              htmlFor="home-reset-new-pwd"
                              style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.88rem' }}
                            >
                              New Password *
                            </label>
                            <PasswordInput
                              id="home-reset-new-pwd"
                              placeholder="Enter new strong password"
                              value={resetNewPassword}
                              onChange={(e) => setResetNewPassword(e.target.value)}
                              disabled={loading}
                              required
                              autoFocus
                              style={{
                                padding: '0.7rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.92rem'
                              }}
                            />
                            <PasswordStrengthChecklist password={resetNewPassword} />
                          </div>

                          <div style={{ marginBottom: '1rem' }}>
                            <label
                              htmlFor="home-reset-confirm-pwd"
                              style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.35rem', fontSize: '0.88rem' }}
                            >
                              Confirm New Password *
                            </label>
                            <PasswordInput
                              id="home-reset-confirm-pwd"
                              placeholder="Confirm new password"
                              value={resetConfirmPassword}
                              onChange={(e) => setResetConfirmPassword(e.target.value)}
                              disabled={loading}
                              required
                              style={{
                                padding: '0.7rem 0.85rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                fontSize: '0.92rem'
                              }}
                            />
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                            <button
                              type="submit"
                              disabled={loading}
                              style={{
                                width: '100%',
                                padding: '0.8rem',
                                borderRadius: '8px',
                                border: 'none',
                                backgroundColor: '#174b0f',
                                color: '#ffffff',
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                cursor: loading ? 'not-allowed' : 'pointer'
                              }}
                            >
                              {loading ? 'Resetting Password...' : 'Reset Password'}
                            </button>
                            <button
                              type="button"
                              onClick={resetSignInFlow}
                              disabled={loading}
                              style={{
                                width: '100%',
                                padding: '0.7rem',
                                borderRadius: '8px',
                                border: '1px solid #cbd5e1',
                                backgroundColor: '#ffffff',
                                color: '#475569',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              ← Back to Sign In
                            </button>
                          </div>
                        </form>
                      )}
                    </>
                  )}
                </>
              )}

              {/* TAB 2: CREATE ACCOUNT (Customer information is personal and not tied to a business) */}
              {activeTab === 'signup' && (
                <form onSubmit={handleCustomerSignUp}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={signUpFirstName}
                        onChange={(e) => setSignUpFirstName(e.target.value)}
                        placeholder="Jane"
                        required
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.9rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={signUpLastName}
                        onChange={(e) => setSignUpLastName(e.target.value)}
                        placeholder="Doe"
                        required
                        disabled={loading}
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.9rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                      Email Address *
                    </label>
                    <input
                      type="email"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="jane.doe@example.com"
                      required
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                      Phone Number *
                    </label>
                    <input
                      type="tel"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      placeholder="(555) 234-5678"
                      required
                      disabled={loading}
                      style={{
                        width: '100%',
                        padding: '0.65rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#1e293b', marginBottom: '0.3rem' }}>
                      Password *
                    </label>
                    <PasswordInput
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="Create a password"
                      required
                      disabled={loading}
                      style={{
                        padding: '0.65rem 0.75rem',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.9rem'
                      }}
                    />
                    <PasswordStrengthChecklist password={signUpPassword} />
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontSize: '0.84rem',
                      color: '#475569',
                      marginBottom: '1rem',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={signUpSmsOptIn}
                      onChange={(e) => setSignUpSmsOptIn(e.target.checked)}
                      disabled={loading}
                    />
                    Receive SMS booking confirmations and reminders
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      width: '100%',
                      padding: '0.8rem',
                      borderRadius: '8px',
                      border: 'none',
                      backgroundColor: '#174b0f',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {loading ? 'Creating Account...' : 'Create Account'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
