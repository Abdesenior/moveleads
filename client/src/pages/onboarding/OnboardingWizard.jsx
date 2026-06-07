/**
 * OnboardingWizard (v2) — 8-step direct-replacement controller.
 *
 * Visible flow:
 *   1. Welcome         (eyebrow / H1 / 4-icon flow / 3 trust chips)
 *   2. Location        (company base — production PlaceAutocomplete)
 *   3. Delivery        (3 mode cards + interactive US map)
 *   4. Contact         (phone + verify card + email + channel toggles)
 *   5. SMS Claim       (showcase + footer opt-in via PATCH)
 *   6. Almost Ready    (interstitial — staggered checklist + bonus tease)
 *   7. Activate        (tier picker → real Stripe Payment Element)
 *   8. Success         (personalized checklist + SMS Claim aside)
 *
 * Server `onboarding.currentStep` semantics (preserved from v1 for resume
 * compatibility — the server is unchanged):
 *
 *     server step 1 → v2 screen 2 (Location)
 *     server step 2 → v2 screen 3 (Delivery)
 *     server step 3 → v2 screen 4 (Contact)
 *     server step 4 → v2 screen 5 (SMS Claim)
 *     server step 5 → v2 screen 6 (Almost Ready)
 *
 * A returning mover with currentStep=N resumes at the corresponding screen
 * above — never back to Welcome (1). Welcome is a fresh-mount-only screen.
 *
 * Activation, dismissal, and verify flows are unchanged from v1:
 *   - POST /api/onboarding/save-step           (per-step persistence)
 *   - POST /api/billing/create-payment-intent  (real Stripe)
 *   - POST /api/billing/verify-payment-intent  (server-side completion)
 *   - POST /api/onboarding/dismiss-activation-offer  (browse-first)
 *   - PATCH /api/users/me/sms-claim             { optInRequested }
 *   - OnboardingVerifyModal (Twilio Verify — wizard-native variant)
 *
 * Pickup is auto-derived from delivery (no UI for it):
 *   derivePickup(deliveryUiMode, deliveryStates, homeState) → {mode, states}
 */

import { useState, useEffect, useContext, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ArrowRight } from 'lucide-react';
import { AuthContext } from '../../context/AuthContext';
import { US_STATES } from '../../data/usStates';
import OnboardingVerifyModal from '../../components/OnboardingVerifyModal';
import { useToast } from '../../components/ui/Toast';
import {
  splitAddress,
  buildStatesPhrase,
  buildSmsRoute,
  derivePickup,
  mapDeliveryUiToServer,
} from './personalize';
import StepWelcome from './steps/StepWelcome';
import StepLocation from './steps/StepLocation';
import StepDelivery from './steps/StepDelivery';
import StepContact from './steps/StepContact';
import StepSmsClaim from './steps/StepSmsClaim';
import StepAlmostReady from './steps/StepAlmostReady';
import StepActivate from './steps/StepActivate';
import StepSuccess from './steps/StepSuccess';
import './Onboarding.css';

const SCREENS = {
  WELCOME:      1,
  LOCATION:     2,
  DELIVERY:     3,
  CONTACT:      4,
  SMS_CLAIM:    5,
  ALMOST_READY: 6,
  ACTIVATE:     7,
  SUCCESS:      8,
};

// Kebab-case names mirrored onto data-screen on the wizard root. Used by
// Onboarding.css to apply per-step layout tweaks (e.g. the mobile
// fullscreen treatment for the Location step).
const SCREEN_NAMES = {
  [SCREENS.WELCOME]:      'welcome',
  [SCREENS.LOCATION]:     'location',
  [SCREENS.DELIVERY]:     'delivery',
  [SCREENS.CONTACT]:      'contact',
  [SCREENS.SMS_CLAIM]:    'sms-claim',
  [SCREENS.ALMOST_READY]: 'almost-ready',
  [SCREENS.ACTIVATE]:     'activate',
  [SCREENS.SUCCESS]:      'success',
};

const SERVER_TO_SCREEN = {
  1: SCREENS.LOCATION,
  2: SCREENS.DELIVERY,
  3: SCREENS.CONTACT,
  4: SCREENS.SMS_CLAIM,
  5: SCREENS.ALMOST_READY,
};

const SETUP_STAGES = [
  { id: 1, label: 'Your company'           },
  { id: 2, label: 'Where you work'         },
  { id: 3, label: 'How we reach you'       },
  { id: 4, label: 'Add your first balance' },
  { id: 5, label: 'Payment'                },
];

const STEP_TO_STAGE = {
  [SCREENS.LOCATION]:     1,
  [SCREENS.DELIVERY]:     2,
  [SCREENS.CONTACT]:      3,
  [SCREENS.SMS_CLAIM]:    3,
  [SCREENS.ALMOST_READY]: 3,
  [SCREENS.ACTIVATE]:     4,
};

function normalizeUSDigits(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.slice(0, 10);
}

function isValidUSPhone(input) {
  const d = normalizeUSDigits(input);
  if (d.length !== 10) return false;
  if (d[0] < '2' || d[3] < '2') return false;
  return true;
}

export default function OnboardingWizard({ onClose, initialStep, sandbox = false }) {
  const { API_URL, refreshUser, user } = useContext(AuthContext);
  const toast = useToast();
  const navigate = useNavigate();

  // initialStep, when provided, is a v2 SCREENS value (1–8). DashboardLayout
  // uses SCREENS.ACTIVATE (7) for both the banner-CTA "open activation" path
  // and the recovery deep-link ?activate=1. The status-load effect below
  // OVERRIDES this initial pick only when initialStep is null/undefined AND
  // the server-tracked currentStep is set — i.e. a true mid-wizard resume.
  const [screen, setScreen] = useState(initialStep || SCREENS.WELCOME);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(!!user?.phoneVerified);

  const [dispatchBase, setDispatchBase] = useState({ input: '', zip: '', city: '', state: '' });
  const [deliveryMode, setDeliveryMode]     = useState('');
  const [deliveryStates, setDeliveryStates] = useState([]);

  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [channels, setChannels] = useState({
    text:  user?.smsNotif   !== undefined ? !!user.smsNotif   : true,
    email: user?.emailNotif !== undefined ? !!user.emailNotif : true,
  });

  const [smsOptIn, setSmsOptIn] = useState(false);

  const [tier, setTier] = useState(100);
  const [intent, setIntent] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [matchCount, setMatchCount] = useState(null);

  useEffect(() => {
    setPhoneVerified(!!user?.phoneVerified);
  }, [user?.phoneVerified]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const sync = () => {
      document.documentElement.style.setProperty('--ow-vh', `${vv.height}px`);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      document.documentElement.style.removeProperty('--ow-vh');
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!phone && user.phone) setPhone(user.phone);
    if (!email && user.email) setEmail(user.email);
  }, [user?.phone, user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/onboarding/status`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !data?.onboarding) return;
        const ob = data.onboarding;
        const a = ob.answers || {};

        if (a.dispatchBase && a.dispatchBase.zip) setDispatchBase(a.dispatchBase);

        if (a.delivery && typeof a.delivery.mode === 'string') {
          const ui = a.delivery.mode === 'same' ? 'local'
            : a.delivery.mode === 'nationwide' ? 'all'
            : a.delivery.mode === 'states' ? 'some'
            : '';
          if (ui) setDeliveryMode(ui);
          if (Array.isArray(a.delivery.states)) setDeliveryStates(a.delivery.states);
        }

        if (typeof a.phone === 'string' && a.phone) setPhone(a.phone);
        if (typeof a.smsNotif === 'boolean')   setChannels((c) => ({ ...c, text: a.smsNotif }));
        if (typeof a.emailNotif === 'boolean') setChannels((c) => ({ ...c, email: a.emailNotif }));

        if (!initialStep && ob.currentStep && SERVER_TO_SCREEN[ob.currentStep]) {
          setScreen(SERVER_TO_SCREEN[ob.currentStep]);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [API_URL, initialStep]);

  const toggleDeliveryState = useCallback((code) => {
    setDeliveryStates((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  const setChannel = useCallback((id, on) => {
    setChannels((prev) => ({ ...prev, [id]: !!on }));
  }, []);

  const cityState = useMemo(() => {
    const cityFromBase = dispatchBase.city || '';
    const stateFromBase = dispatchBase.state || '';
    const label = cityFromBase && stateFromBase
      ? `${cityFromBase}, ${stateFromBase}`
      : (dispatchBase.input || '');
    const parsed = splitAddress(label);
    return {
      city: cityFromBase || parsed.cityName,
      state: stateFromBase || parsed.stateAbbr,
      label,
    };
  }, [dispatchBase]);
  const statesPhrase = useMemo(() => buildStatesPhrase(deliveryStates), [deliveryStates]);
  const smsRoute = useMemo(
    () => buildSmsRoute({
      cityName: cityState.city,
      deliveryStates,
      deliveryMode,
    }),
    [cityState.city, deliveryStates, deliveryMode]
  );

  const balance = Math.round(user?.balance || 0);
  const bonusPath = !!user?.onboarding?.bonusClaimedAt || balance >= 150;

  useEffect(() => {
    if (screen !== SCREENS.SUCCESS) return;
    if (!cityState.state) return;
    let alive = true;
    fetch(`${API_URL}/leads`, {
      headers: { 'x-auth-token': localStorage.getItem('token') || '' },
    })
      .then(r => r.json())
      .then(data => {
        if (!alive || !Array.isArray(data)) return;
        const codeLc = (cityState.state || '').toLowerCase();
        const count = data.filter(l => {
          const o = (l.originCity || '').toLowerCase();
          const d = (l.destinationCity || '').toLowerCase();
          if (!codeLc) return false;
          const rx = new RegExp(`(?:^|[\\s,])${codeLc}(?:$|[\\s,])`);
          return rx.test(o) || rx.test(d);
        }).length;
        setMatchCount(count);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [screen, API_URL, cityState.state]);

  function buildSavePayload(serverStep) {
    const pickup = derivePickup({
      deliveryUiMode: deliveryMode,
      deliveryStates,
      homeState: dispatchBase.state,
    });
    return {
      step: serverStep,
      answers: {
        dispatchBase,
        primaryMarket: cityState.label || '',
        pickup,
        delivery: {
          mode: mapDeliveryUiToServer(deliveryMode || 'local'),
          states: deliveryStates,
        },
        phone: normalizeUSDigits(phone),
        smsNotif:   channels.text,
        emailNotif: channels.email,
      },
    };
  }

  async function saveStep(serverStep) {
    const body = buildSavePayload(serverStep);
    const res = await fetch(`${API_URL}/onboarding/save-step`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-token': localStorage.getItem('token') || '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`save-step ${res.status} ${txt}`.trim());
    }
  }

  async function openVerify() {
    if (saving) return;
    setSaveError('');
    setSaving(true);
    try {
      await saveStep(3);
      if (refreshUser) refreshUser().catch(() => {});
      setVerifyOpen(true);
    } catch (err) {
      console.error('[OnboardingWizard] inline verify save failed:', err);
      setSaveError("We couldn't save your phone number. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleVerifySuccess() {
    setVerifyOpen(false);
    setPhoneVerified(true);
    if (refreshUser) refreshUser().catch(() => {});
    setScreen(SCREENS.SMS_CLAIM);
  }

  function handleVerifyClose() {
    setVerifyOpen(false);
    // Phone verification is REQUIRED in both sandbox AND production modes.
    // Closing the modal ("Wrong number?", X, backdrop click) only hides
    // it — the mover stays on Step 4 (Contact) with the phone field
    // amber. Clicking Continue retriggers the modal. No soft-skip.
    //
    // Server-side enforcement (server/middleware/requirePhoneVerified.js)
    // blocks step >= 4 saves, onboarding/complete, all PaymentIntent
    // creates, and SMS Claim opt-in if the phone is unverified — so any
    // bypass attempt against the UI fails at the API boundary too.
    if (toast && toast.info) {
      toast.info(
        'Phone verification required',
        "We text you when matching homeowner requests come in. Click Verify now on the Contact step to confirm your number."
      );
    }
  }

  async function patchSmsClaim(optInRequested) {
    try {
      await fetch(`${API_URL}/users/me/sms-claim`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': localStorage.getItem('token') || '',
        },
        body: JSON.stringify({ optInRequested }),
      });
    } catch (err) {
      console.error('[OnboardingWizard] sms-claim patch failed:', err);
    }
  }

  async function chooseSms(optIn) {
    if (saving) return;
    setSaving(true);
    setSmsOptIn(optIn);
    try {
      await patchSmsClaim(optIn);
      try { await saveStep(5); } catch (err) {
        console.error('[OnboardingWizard] saveStep(5) failed:', err);
      }
      setScreen(SCREENS.ALMOST_READY);
    } finally {
      setSaving(false);
    }
  }

  async function onCreateIntent(currentTier) {
    try {
      const res = await fetch(`${API_URL}/billing/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-token': localStorage.getItem('token') || '',
        },
        body: JSON.stringify({ amount: currentTier, source: 'onboarding_activation' }),
      });
      const data = await res.json();
      if (!res.ok || !data?.clientSecret) {
        return { ok: false, msg: data?.msg || `Could not start payment (status ${res.status}).` };
      }
      setIntent(data);
      return { ok: true };
    } catch (err) {
      console.error('[Activation] create-payment-intent threw', err);
      return { ok: false, msg: err?.message || 'Network error starting payment.' };
    }
  }

  async function onPaid() {
    if (refreshUser) await refreshUser();
    setScreen(SCREENS.SUCCESS);
  }

  async function onBrowseFirst() {
    try {
      await fetch(`${API_URL}/onboarding/dismiss-activation-offer`, {
        method: 'POST',
        headers: {
          'x-auth-token': localStorage.getItem('token') || '',
          'Content-Type': 'application/json',
        },
      });
    } catch { /* non-blocking — banner still works */ }
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  async function closeAfterSuccess() {
    if (refreshUser) await refreshUser();
    if (onClose) onClose();
    navigate('/dashboard/leads');
  }

  async function advance() {
    if (saving) return;
    setSaveError('');

    if (screen === SCREENS.WELCOME) {
      setScreen(SCREENS.LOCATION);
      return;
    }

    if (screen === SCREENS.LOCATION) {
      if (!dispatchBase.zip) return;
      setSaving(true);
      try {
        await saveStep(1);
        setScreen(SCREENS.DELIVERY);
      } catch (err) {
        console.error('[OnboardingWizard] saveStep(1) failed:', err);
        setSaveError("We couldn't save that step. Check your connection and try again.");
      } finally { setSaving(false); }
      return;
    }

    if (screen === SCREENS.DELIVERY) {
      if (!deliveryMode) return;
      if (deliveryMode === 'some' && deliveryStates.length === 0) return;
      setSaving(true);
      try {
        await saveStep(2);
        setScreen(SCREENS.CONTACT);
      } catch (err) {
        console.error('[OnboardingWizard] saveStep(2) failed:', err);
        setSaveError("We couldn't save that step. Check your connection and try again.");
      } finally { setSaving(false); }
      return;
    }

    if (screen === SCREENS.CONTACT) {
      if (!isValidUSPhone(phone)) return;
      setSaving(true);
      try {
        await saveStep(3);
        try {
          const res = await fetch(`${API_URL}/auth/me`, {
            headers: { 'x-auth-token': localStorage.getItem('token') || '' },
          });
          if (res.ok) {
            const fresh = await res.json();
            setPhoneVerified(!!fresh.phoneVerified);
            if (refreshUser) refreshUser().catch(() => {});
            if (fresh.phoneVerified === true) {
              setScreen(SCREENS.SMS_CLAIM);
            } else {
              // Phone unverified — open the verify modal. No soft-skip.
              setVerifyOpen(true);
            }
          } else {
            // /auth/me failure (network, 5xx). Phone verification is
            // REQUIRED so we open the modal rather than silently
            // advancing. The server-side requirePhoneVerified gate
            // would refuse the next step's save-step anyway.
            setVerifyOpen(true);
          }
        } catch {
          // fetch threw (offline, etc.). Same posture as !res.ok above.
          setVerifyOpen(true);
        }
      } catch (err) {
        console.error('[OnboardingWizard] saveStep(3) failed:', err);
        setSaveError("We couldn't save that step. Check your connection and try again.");
      } finally { setSaving(false); }
      return;
    }

    if (screen === SCREENS.ALMOST_READY) {
      try { await saveStep(5); } catch (err) {
        console.error('[OnboardingWizard] saveStep(5) failed:', err);
      }
      setScreen(SCREENS.ACTIVATE);
      return;
    }
  }

  function back() {
    if (saving) return;
    const order = [
      SCREENS.WELCOME, SCREENS.LOCATION, SCREENS.DELIVERY,
      SCREENS.CONTACT, SCREENS.SMS_CLAIM, SCREENS.ALMOST_READY,
      SCREENS.ACTIVATE,
    ];
    const i = order.indexOf(screen);
    if (i > 0) {
      if (screen === SCREENS.ACTIVATE) setIntent(null);
      setScreen(order[i - 1]);
    }
  }

  const showFooter =
    screen === SCREENS.WELCOME ||
    screen === SCREENS.LOCATION ||
    screen === SCREENS.DELIVERY ||
    screen === SCREENS.CONTACT ||
    screen === SCREENS.SMS_CLAIM ||
    screen === SCREENS.ALMOST_READY;

  const visibleStage = STEP_TO_STAGE[screen];
  const showProgress = !!visibleStage;

  function footerForScreen() {
    if (screen === SCREENS.WELCOME) {
      return {
        nextLabel: 'Get started →',
        canAdvance: true,
        showBack: false,
      };
    }
    if (screen === SCREENS.LOCATION) {
      return {
        nextLabel: saving ? 'Saving…' : 'Continue →',
        canAdvance: !!dispatchBase.zip,
        showBack: true,
      };
    }
    if (screen === SCREENS.DELIVERY) {
      const ready = !!deliveryMode &&
        (deliveryMode !== 'some' || deliveryStates.length > 0);
      return {
        nextLabel: saving ? 'Saving…' : 'Continue →',
        canAdvance: ready,
        showBack: true,
      };
    }
    if (screen === SCREENS.CONTACT) {
      return {
        nextLabel: saving ? 'Saving…' : 'Continue →',
        canAdvance: isValidUSPhone(phone),
        showBack: true,
      };
    }
    if (screen === SCREENS.SMS_CLAIM) {
      return null;
    }
    if (screen === SCREENS.ALMOST_READY) {
      return {
        nextLabel: 'Continue →',
        canAdvance: true,
        showBack: true,
      };
    }
    return null;
  }

  const footer = showFooter ? footerForScreen() : null;

  const ctx = {
    API_URL,
    dispatchBase, setDispatchBase,
    cityName: cityState.city,
    stateAbbr: cityState.state,
    deliveryMode, setDeliveryMode,
    deliveryStates, toggleDeliveryState,
    statesPhrase,
    phone, setPhone,
    email, setEmail,
    phoneVerified,
    channels, setChannel,
    openVerify,
    smsRoute,
    smsEnabled: smsOptIn,
    smsChosen: true,
    chooseSms,
    tier, setTier,
    intent, setIntent,
    onCreateIntent,
    onBrowseFirst,
    onPaid,
    bonusPath,
    balance,
    marketLabel: cityState.label || 'your market',
    matchCount,
    onDone: closeAfterSuccess,
  };

  return (
    <div
      className="onboarding-wizard"
      data-screen={SCREEN_NAMES[screen] || ''}
      role="dialog"
      aria-label="MoveLeads onboarding"
    >
      <div className="ow-blur" />
      <div className="ow-modal" style={{ position: 'relative' }}>
        {screen === SCREENS.ACTIVATE && (
          <button
            type="button"
            className="ow-close"
            aria-label="Close"
            onClick={onBrowseFirst}
            style={{
              position: 'absolute', top: 14, right: 14,
              width: 44, height: 44, borderRadius: 12,
              background: 'rgba(15,23,42,0.06)', border: 'none',
              color: 'rgba(15,23,42,0.7)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <X size={18} />
          </button>
        )}

        {showProgress && (
          <div
            className="ow-progress-bar-wrap"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={SETUP_STAGES.length}
            aria-valuenow={visibleStage}
            aria-label={`Step ${visibleStage} of ${SETUP_STAGES.length}`}
          >
            <div className="ow-progress">
              <div
                className="ow-progress-fill"
                style={{ width: `${(visibleStage / SETUP_STAGES.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="ow-body">
          <div className="ow-step-anim" key={screen}>
            {screen === SCREENS.WELCOME      && <StepWelcome ctx={ctx} />}
            {screen === SCREENS.LOCATION     && <StepLocation ctx={ctx} />}
            {screen === SCREENS.DELIVERY     && <StepDelivery ctx={ctx} />}
            {screen === SCREENS.CONTACT      && <StepContact ctx={ctx} />}
            {screen === SCREENS.SMS_CLAIM    && <StepSmsClaim ctx={ctx} />}
            {screen === SCREENS.ALMOST_READY && <StepAlmostReady ctx={ctx} />}
            {screen === SCREENS.ACTIVATE     && <StepActivate ctx={ctx} />}
            {screen === SCREENS.SUCCESS      && <StepSuccess ctx={ctx} />}
          </div>
        </div>

        {footer && (
          <div className="ow-footer">
            <div className="ow-footer-left">
              {footer.showBack && (
                <button
                  type="button"
                  className="ow-back"
                  onClick={back}
                  disabled={saving}
                >
                  ← Back
                </button>
              )}
              {saveError && (
                <span className="ow-save-error" role="alert">{saveError}</span>
              )}
            </div>
            {screen === SCREENS.SMS_CLAIM ? null : (
              <button
                type="button"
                className="ow-next"
                onClick={advance}
                disabled={saving || !footer.canAdvance}
                aria-busy={saving}
              >
                {saving && <span className="ow-spinner ow-spinner-on-cta" aria-hidden="true" />}
                <span>{footer.nextLabel}</span>
              </button>
            )}
          </div>
        )}

        {screen === SCREENS.SMS_CLAIM && (
          <div className="ow-footer">
            <div className="ow-footer-left">
              <button
                type="button"
                className="ow-back"
                onClick={back}
                disabled={saving}
              >
                ← Back
              </button>
              <button
                type="button"
                className="ow-skip-link"
                onClick={() => chooseSms(false)}
                disabled={saving}
              >
                I'll enable it later
              </button>
            </div>
            <button
              type="button"
              className="ow-next"
              onClick={() => chooseSms(true)}
              disabled={saving}
            >
              <span>Enable SMS Claim</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Wizard always uses OnboardingVerifyModal — both sandbox and
         production. Both modal components call the same real Twilio
         Verify endpoints; the difference is the "Wrong number?" CTA.
         The dashboard's VerifyPhoneModal links to /dashboard/settings
         (yanking the mover out of the wizard); OnboardingVerifyModal
         just closes back to Step 4 so the phone field stays editable
         in place. Dashboard Settings continues to use VerifyPhoneModal
         for its own re-verify flow — unaffected. */}
      <OnboardingVerifyModal
        isOpen={verifyOpen}
        onClose={handleVerifyClose}
        onSuccess={handleVerifySuccess}
      />
    </div>
  );
}

export { SETUP_STAGES };
