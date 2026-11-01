import React, { useState, useContext, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { AuthContext } from '../shared/Context/auth-context';
import { useUserProfile } from '../shared/Context/UserProfileContext';
import { getResolvedBaseUrl } from '../shared/Utils/apiConfig';

const MAX_OTP_ATTEMPTS = 3;

interface LookupResponse {
  found: boolean;
  source: 'users_table' | 'customers' | null;
  auth_method: 'OTP_6_DIGIT' | 'PASSWORD' | null;
  has_password?: boolean;
  account?: any;
  message?: string;
}

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

  // Account tabs: 'signin' | 'signup'
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Sign-In state
  const [identifier, setIdentifier] = useState<string>('');
  const [signInStep, setSignInStep] = useState<'lookup' | 'staff_otp' | 'customer_password'>('lookup');
  const [matchedAccount, setMatchedAccount] = useState<any>(null);
  const [customerHasPassword, setCustomerHasPassword] = useState<boolean>(true);

  // Verification code state
  const [generatedOtp, setGeneratedOtp] = useState<string>('');
  const [otpInput, setOtpInput] = useState<string>('');
  const [otpAttempts, setOtpAttempts] = useState<number>(0);

  // Password state
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
    }
  }, [location.search, location.hash]);

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
  };

  const handleStateChange = (stateVal: string) => {
    setSelectedState(stateVal);
    setSelectedCity('');
  };

  const resetSignInFlow = () => {
    setSignInStep('lookup');
    setMatchedAccount(null);
    setGeneratedOtp('');
    setOtpInput('');
    setOtpAttempts(0);
    setCustomerPassword('');
    setError('');
    setInfoMessage('');
  };

  const handleLookupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('Please enter your phone number or email address.');
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      const res = await axios.post<LookupResponse>(`${currentApiUrl}/auth/lookup`, {
        identifier: trimmed
      });

      const data = res.data;

      if (data.found && data.source === 'users_table') {
        setMatchedAccount(data.account);

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        setGeneratedOtp(otp);
        console.log('--- VERIFICATION CODE ---');
        console.log(`Code: ${otp}`);
        console.log('-------------------------');

        setOtpAttempts(0);
        setOtpInput('');
        setSignInStep('staff_otp');
        setInfoMessage('Please enter your 6-digit verification code to continue.');
      } else if (data.found && data.source === 'customers') {
        setMatchedAccount(data.account);
        setCustomerHasPassword(Boolean(data.has_password));
        setCustomerPassword('');
        setSignInStep('customer_password');
        setInfoMessage(
          data.has_password
            ? 'Please enter your password to sign in.'
            : 'Please create a password below to complete your sign in.'
        );
      } else {
        setError('No account was found with those details. Please create an account to continue.');
        if (trimmed.includes('@')) {
          setSignUpEmail(trimmed);
        } else {
          setSignUpPhone(trimmed);
        }
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Unable to verify your account right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleStaffOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (otpAttempts >= MAX_OTP_ATTEMPTS) {
      setError('Too many failed attempts. Please go back and request a new code.');
      return;
    }

    if (otpInput.trim() !== generatedOtp) {
      const nextAttempts = otpAttempts + 1;
      setOtpAttempts(nextAttempts);
      const remaining = MAX_OTP_ATTEMPTS - nextAttempts;
      if (remaining > 0) {
        setError(`Incorrect verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
      } else {
        setError('Too many failed attempts. Please go back and request a new code.');
      }
      return;
    }

    setLoading(true);
    try {
      const currentApiUrl = getResolvedBaseUrl();
      await axios.post(`${currentApiUrl}/profile/${matchedAccount.user_guid}`, matchedAccount);
      await refreshProfile(matchedAccount.user_guid);
      auth.login();
      const targetBiz = matchedAccount.business || 'alpha_rentals';
      navigate(`/${targetBiz}`, { replace: true });
    } catch {
      setError('Unable to sign in right now. Please try again.');
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

    if (signUpPassword.length < 4) {
      setError('Password must be at least 4 characters long.');
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

  const isOtpLocked = otpAttempts >= MAX_OTP_ATTEMPTS;

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
                1. Country
              </label>
              <select
                id="filter-country"
                value={selectedCountry}
                onChange={(e) => handleCountryChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
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
            </div>

            <div>
              <label
                htmlFor="filter-state"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.35rem' }}
              >
                2. State / Province
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
                  border: '1px solid #cbd5e1',
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
            </div>

            <div>
              <label
                htmlFor="filter-city"
                style={{ display: 'block', fontWeight: 600, fontSize: '0.88rem', color: '#1e293b', marginBottom: '0.35rem' }}
              >
                3. City
              </label>
              <select
                id="filter-city"
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                disabled={!selectedState}
                style={{
                  width: '100%',
                  padding: '0.7rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
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
                          {biz.business_name}
                        </div>
                        <div style={{ fontSize: '0.86rem', color: '#475569', marginBottom: '0.4rem', lineHeight: 1.45 }}>
                          {biz.summary}
                        </div>
                        <div style={{ fontSize: '0.82rem', color: '#64748b' }}>
                          📍 {biz.physical_address}
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
            onClick={(e) => {
              e.preventDefault();
              setShowReservationFinder(true);
            }}
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
                  onClick={() => setShowReservationFinder(true)}
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
                    Open Supervisor Control Panel
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
                    <form onSubmit={handleLookupSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor="home-login-identifier"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.4rem', fontSize: '0.92rem' }}
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
                        {loading ? 'Please wait...' : 'Continue'}
                      </button>
                    </form>
                  )}

                  {signInStep === 'staff_otp' && (
                    <form onSubmit={handleStaffOtpSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor="home-staff-otp"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.4rem', fontSize: '0.92rem' }}
                        >
                          6-Digit Verification Code
                        </label>
                        <input
                          id="home-staff-otp"
                          type="text"
                          maxLength={6}
                          placeholder="Enter 6-digit code"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                          disabled={loading || isOtpLocked}
                          required
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: `2px solid ${isOtpLocked ? '#dc2626' : '#174b0f'}`,
                            fontSize: '1.15rem',
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
                          disabled={loading || isOtpLocked}
                          style={{
                            width: '100%',
                            padding: '0.8rem',
                            borderRadius: '8px',
                            border: 'none',
                            backgroundColor: '#174b0f',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            cursor: loading || isOtpLocked ? 'not-allowed' : 'pointer'
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
                          ← Back
                        </button>
                      </div>
                    </form>
                  )}

                  {signInStep === 'customer_password' && (
                    <form onSubmit={handleCustomerPasswordSubmit}>
                      <div style={{ marginBottom: '1rem' }}>
                        <label
                          htmlFor="home-customer-password"
                          style={{ display: 'block', fontWeight: 600, color: '#1e293b', marginBottom: '0.4rem', fontSize: '0.92rem' }}
                        >
                          {customerHasPassword ? 'Password' : 'Create Password'}
                        </label>
                        <input
                          id="home-customer-password"
                          type="password"
                          placeholder="Enter your password"
                          value={customerPassword}
                          onChange={(e) => setCustomerPassword(e.target.value)}
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
                    <input
                      type="password"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="Create a password"
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
