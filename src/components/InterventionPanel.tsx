'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ShieldAlert,
  Smartphone,
  HelpCircle,
  FileText,
  Paperclip,
  Key,
  ClipboardList,
  ExternalLink,
  Save,
  ArrowRight,
  Zap,
  Maximize2,
  ImageIcon,
  X,
  Lock,
  UserPlus,
  LogIn,
  Eye,
  EyeOff,
  Radio,
  Monitor,
} from 'lucide-react';
import { ConnectJobBoardModal } from '@/components/ConnectJobBoardModal';
import { InteractiveBrowserStream } from '@/components/InteractiveBrowserStream';

interface InterventionPanelProps {
  interventionId: string;
  reason: string;
  description: string;
  screenshotUrl?: string | null;
  pageUrl?: string | null;
  jobId?: string | null;
  sessionId?: string | null;
  onResolved: () => void;
}

const REASON_LABELS: Record<string, string> = {
  captcha:                               'CAPTCHA Verification Required',
  mfa_required:                          'Two-Factor Authentication Required',
  unknown_question:                      'Application Question Required',
  unexpected_page:                       'Custom Portal or Unsupported Layout',
  job_closed:                            'Job No Longer Accepting Applications',
  resume_rejected:                       'Resume Format Rejected by ATS',
  attachment_missing:                    'Required Attachment Missing',
  login_required:                        'Candidate Account Required',
  job_board_auth_required:               'Job Board Account Required',
  assessment_required:                   'Candidate Assessment Required',
  application_destination_not_found:     'Application Destination Not Found',
  application_not_found:                 'Application Control Not Found',
  application_found_but_not_actionable:  'Application Control Not Actionable',
  application_blocked_by_modal:          'Application Blocked by Website Modal',
  application_blocked_by_marketing_modal:'Application Blocked by Marketing Popup',
  application_blocked_by_cookie_banner:  'Application Blocked by Cookie Consent',
  application_blocked_by_login:          'Candidate Account Required',
  application_blocked_by_authentication: 'Candidate Authentication Required',
  application_blocked_by_captcha:        'Application Blocked by Security CAPTCHA',
  application_blocked_by_bot_challenge:  'Application Blocked by Bot Verification',
  application_blocked_by_security_challenge: 'Application Blocked by Security Check',
  application_blocked_by_unknown_ui:     'Application Blocked by UI Overlay',
  application_interaction_failed:        'Application Interaction Failed',
};

function getPortalDisplayName(pageUrl?: string | null, description?: string | null): string {
  const combined = `${pageUrl || ''} ${description || ''}`.toLowerCase();
  if (combined.includes('workday') || combined.includes('myworkdayjobs')) return 'Workday';
  if (combined.includes('greenhouse')) return 'Greenhouse';
  if (combined.includes('lever')) return 'Lever';
  if (combined.includes('taleo')) return 'Taleo';
  if (combined.includes('icims')) return 'iCIMS';
  if (combined.includes('smartrecruiters')) return 'SmartRecruiters';
  if (combined.includes('jobvite')) return 'Jobvite';
  if (combined.includes('ashby')) return 'Ashby';
  if (combined.includes('adp') || combined.includes('workforcenow')) return 'ADP';
  if (combined.includes('successfactors') || combined.includes('sap')) return 'SAP SuccessFactors';
  if (combined.includes('bamboohr')) return 'BambooHR';
  return 'The employer portal';
}

function getJobBoardProvider(pageUrl?: string | null, description?: string | null) {
  const combined = `${pageUrl || ''} ${description || ''}`.toLowerCase();
  if (combined.includes('dice')) return { id: 'dice', name: 'Dice', description: 'Connect your Dice candidate account session' };
  if (combined.includes('ziprecruiter')) return { id: 'ziprecruiter', name: 'ZipRecruiter', description: 'Connect your ZipRecruiter candidate account session' };
  if (combined.includes('linkedin')) return { id: 'linkedin', name: 'LinkedIn', description: 'Connect your LinkedIn candidate account session' };
  if (combined.includes('indeed')) return { id: 'indeed', name: 'Indeed', description: 'Connect your Indeed candidate account session' };
  return null;
}

function getReasonIcon(reason: string, isClosed: boolean, isUnsupportedOrFatal: boolean) {
  if (isClosed || reason === 'job_closed') return <ShieldAlert size={16} color="#ef4444" />;
  if (isUnsupportedOrFatal) return <AlertTriangle size={16} color="#f97316" />;
  switch (reason) {
    case 'captcha':
    case 'application_blocked_by_captcha':
    case 'application_blocked_by_bot_challenge':
    case 'application_blocked_by_security_challenge':
      return <ShieldAlert size={16} color="#fbbf24" />;
    case 'mfa_required': return <Smartphone size={16} color="#fbbf24" />;
    case 'unknown_question': return <HelpCircle size={16} color="#fbbf24" />;
    case 'resume_rejected': return <FileText size={16} color="#fbbf24" />;
    case 'attachment_missing': return <Paperclip size={16} color="#fbbf24" />;
    case 'login_required':
    case 'job_board_auth_required':
    case 'application_blocked_by_login':
    case 'application_blocked_by_authentication':
      return <Key size={16} color="#fbbf24" />;
    case 'assessment_required': return <ClipboardList size={16} color="#fbbf24" />;
    default: return <AlertTriangle size={16} color="#fbbf24" />;
  }
}

const COMMON_COUNTRIES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Australia',
  'Germany',
  'France',
  'India',
  'Netherlands',
  'Ireland',
  'Israel',
  'Spain',
  'Italy',
  'Sweden',
  'Switzerland',
  'Brazil',
  'Mexico',
  'Singapore',
  'Japan',
  'Other',
];

const US_STATE_OPTIONS = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'District of Columbia', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois',
  'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts',
  'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota',
  'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Puerto Rico', 'Rhode Island', 'South Carolina',
  'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming',
];

function getDropdownOptionsForField(q: { label: string; fieldType?: string; options?: string[] }): string[] {
  if (q.options && q.options.length > 0) {
    return q.options;
  }

  const text = q.label.toLowerCase();

  // Country
  if (/^country\b|\bcountry\b/i.test(text)) {
    return COMMON_COUNTRIES;
  }

  // U.S. State / Province / Region
  if (/^state\b|\bstate\b|province|region|u\.s\.\s*state|which.*state/i.test(text)) {
    return US_STATE_OPTIONS;
  }

  // Work authorization
  if (/authorized|eligible to work|legally permitted|legal right to work/i.test(text)) {
    return [
      'Yes, I am authorized to work in the United States',
      'No, I am not authorized to work in the United States',
      'Yes',
      'No',
    ];
  }
  // Visa sponsorship
  if (/sponsorship|require.*visa|visa.*sponsor/i.test(text)) {
    return [
      'No, I do not require sponsorship',
      'Yes, I require sponsorship now or in the future',
      'No',
      'Yes',
    ];
  }
  // Gender
  if (/gender|sex\b/i.test(text)) {
    return ['Male', 'Female', 'Non-Binary', 'Decline to self-identify'];
  }
  // Race / Ethnicity
  if (/race|ethnicity|ethnic/i.test(text)) {
    return [
      'Hispanic or Latino',
      'White (Not Hispanic or Latino)',
      'Black or African American',
      'Asian',
      'Native Hawaiian or Other Pacific Islander',
      'American Indian or Alaska Native',
      'Two or More Races',
      'Decline to self-identify',
    ];
  }
  // Veteran status
  if (/veteran/i.test(text)) {
    return [
      'I am not a protected veteran',
      'I identify as one or more of the classifications of protected veteran',
      'I decline to identify',
    ];
  }
  // Disability status
  if (/disability|handicap/i.test(text)) {
    return [
      'Yes, I have a disability (or previously had a disability)',
      'No, I do not have a disability',
      'I do not wish to answer',
    ];
  }
  // Relocation
  if (/relocate|relocation/i.test(text)) {
    return ['Yes', 'No', 'Negotiable'];
  }
  // Willing to travel
  if (/travel/i.test(text)) {
    return ['0%', '25%', '50%', '75%', '100%', 'Yes', 'No'];
  }
  // Over 18
  if (/\b18\b|legal age/i.test(text)) {
    return ['Yes', 'No'];
  }
  // Highest Education
  if (/education|degree\b/i.test(text)) {
    return ["High School", "Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctorate / Ph.D.", "Other"];
  }
  // Experience level / Years of experience
  if (/years of experience|how many years/i.test(text)) {
    return ['0-1 years', '1-2 years', '3-5 years', '5-7 years', '8+ years', '10+ years'];
  }
  // General Yes / No dropdowns
  if (/^(?:are you|do you|will you|have you)\b/i.test(text.trim()) || /\b(?:yes\/no|select yes or no)\b/i.test(text)) {
    return ['Yes', 'No'];
  }
  // Consent & personal information retention
  if (/consent|personal\s*information|retain\s*data|data\s*retention|gdpr/i.test(text)) {
    return [
      'Yes',
      'No',
      'I consent to have my personal information retained',
      'I do not consent',
    ];
  }
  // Referral source / Where did you hear
  if (/hear\s*about|referral|source|first\s*hear/i.test(text)) {
    return [
      'LinkedIn',
      'Company Website / Careers Page',
      'Job Board (Indeed, Glassdoor, etc.)',
      'Employee Referral',
      'Recruiter Outreach',
      'Event / Conference',
      'Other',
    ];
  }
  // Influenced decision to apply
  if (/decision\s*to\s*apply|influenced.*decision|why.*apply/i.test(text)) {
    return [
      'Company Mission & Culture',
      'Career Growth Opportunities',
      'Product & Technology',
      'Competitive Compensation & Benefits',
      'Remote / Work Flexibility',
      'Team & Leadership',
      'Other',
    ];
  }

  return ['Yes', 'No'];
}

function getEffectiveFieldType(q: { label: string; fieldType?: string; options?: string[] }): 'select' | 'radio' | 'checkbox' | 'textarea' | 'date' | 'text' {
  if (q.fieldType === 'select' || q.fieldType === 'dropdown') return 'select';
  if (q.fieldType === 'radio') return 'radio';
  if (q.fieldType === 'checkbox') return 'checkbox';
  if (q.fieldType === 'textarea') return 'textarea';
  if (q.fieldType === 'date') return 'date';
  if (q.fieldType === 'text') return 'text';

  const text = q.label.toLowerCase();

  if (
    /authorized|eligible to work|legally permitted|legal right to work/i.test(text) ||
    /sponsorship|require.*visa|visa.*sponsor/i.test(text) ||
    /gender|sex\b/i.test(text) ||
    /race|ethnicity|ethnic/i.test(text) ||
    /veteran/i.test(text) ||
    /disability|handicap/i.test(text) ||
    /relocate|relocation/i.test(text) ||
    /willing to travel/i.test(text) ||
    /highest.*education|degree\b/i.test(text) ||
    /years of experience|how many years/i.test(text) ||
    /hear\s*about|referral|source|first\s*hear/i.test(text) ||
    /consent|personal\s*information|retain\s*data/i.test(text) ||
    /^country\b|\bcountry\b/i.test(text) ||
    /^state\b|\bstate\b|province|region|u\.s\.\s*state|which.*state/i.test(text) ||
    /\b(?:select one|please select|choose one|select from the dropdown|dropdown)\b/i.test(text)
  ) {
    return 'select';
  }

  if (q.options && q.options.length > 0) {
    return 'select';
  }

  return (q.fieldType as any) || 'text';
}

export function InterventionPanel({
  interventionId,
  reason,
  description,
  screenshotUrl,
  pageUrl,
  jobId,
  sessionId,
  onResolved,
}: InterventionPanelProps) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState<'completed' | 'skipped' | 'cancelled' | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isScreenshotModalOpen, setIsScreenshotModalOpen] = useState(false);
  const [isStreamModalOpen, setIsStreamModalOpen] = useState(false);

  const [settings, setSettings] = useState<any>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const portalDisplayName = getPortalDisplayName(pageUrl, description);
  const providerInfo = getJobBoardProvider(pageUrl, description);
  const isJobBoardAuthReason = reason === 'job_board_auth_required' && providerInfo !== null;
  const isAtsAuthReason =
    reason === 'login_required' ||
    (reason === 'job_board_auth_required' && providerInfo === null) ||
    reason === 'application_blocked_by_login' ||
    reason === 'application_blocked_by_authentication';
  const isAuthReason = isAtsAuthReason || isJobBoardAuthReason;
  const isMfaReason =
    reason === 'mfa_required' ||
    /security code|verification code|mfa|otp|one-time code/i.test(description || '');

  const [accountMode, setAccountMode] = useState<'sign_in' | 'create_account'>('sign_in');
  const [showPassword, setShowPassword] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isJobBoardConnected, setIsJobBoardConnected] = useState(false);

  const questionData = (() => {
    const text = description || '';
    const start = text.indexOf('[QUESTION_DATA:');
    if (start === -1) return null;
    // Payload is raw JSON that itself contains ']' (options arrays), so scan
    // forward balancing braces instead of matching a non-greedy regex.
    let depth = 0, inStr = false, esc = false, end = -1;
    for (let i = start + '[QUESTION_DATA:'.length; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') inStr = true;
      else if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) return null;
    try {
      return JSON.parse(text.slice(start + '[QUESTION_DATA:'.length, end + 1));
    } catch {
      return null;
    }
  })();

  // QUESTION_DATA may be a single question object or an array of unanswered fields.
  const rawQuestionFields: Array<{
    fieldKey?: string;
    label: string;
    fieldType?: string;
    options?: string[];
    required?: boolean;
    suggestedAnswer?: string;
  }> = Array.isArray(questionData) ? questionData : questionData ? [questionData] : [];
  const hasQuestionFields = rawQuestionFields.length > 0;

  const cleanDescription = (description || '')
    .replace(/\[QUESTION_DATA:\{[\s\S]*?\}\](?=\s|$)/, '')
    .replace(/\[QUESTION_DATA:.*?\]\s*/g, '')
    .trim();

  // Extract fallback question text from description if not structured in QUESTION_DATA
  const extractedQuestionFromDesc = (() => {
    if (hasQuestionFields) return null;
    const match = cleanDescription.match(/(?:requires your input|question|answer is required for|required for|input for|answer:)\s*:?\s*["'“]?([^"'”\n]+)["'”]?/i);
    if (match && match[1] && match[1].trim().length > 3) {
      return match[1].trim();
    }
    return null;
  })();

  const rawEffectiveFields: Array<{
    fieldKey?: string;
    label: string;
    fieldType?: string;
    options?: string[];
    required?: boolean;
    suggestedAnswer?: string;
  }> = hasQuestionFields
    ? rawQuestionFields
    : reason === 'unknown_question' && extractedQuestionFromDesc
    ? [{ label: extractedQuestionFromDesc, fieldType: 'text', required: true }]
    : reason === 'unknown_question' && cleanDescription && cleanDescription.length > 5 && !cleanDescription.toLowerCase().includes('application form on')
    ? [{ label: cleanDescription, fieldType: 'text', required: true }]
    : [];

  // Deduplicate question fields by normalized label to ensure identical questions are not rendered multiple times
  const effectiveQuestionFields = useMemo(() => {
    const seen = new Set<string>();
    const result: typeof rawEffectiveFields = [];
    for (const q of rawEffectiveFields) {
      const normKey = (q.label || q.fieldKey || '').replace(/[\*\u204E\u2217]/g, '').trim().toLowerCase();
      if (!normKey || seen.has(normKey)) continue;
      seen.add(normKey);
      result.push(q);
    }
    return result;
  }, [rawEffectiveFields]);

  const hasEffectiveQuestions = effectiveQuestionFields.length > 0;

  const [customAnswer, setCustomAnswer] = useState<string>('');
  const [batchAnswers, setBatchAnswers] = useState<Record<string, string>>({});
  const [saveForFutureApplications, setSaveForFutureApplications] = useState<boolean>(true);
  const [emailVerificationCode, setEmailVerificationCode] = useState<string>('');

  // Pre-fill batch answers with suggested answers or existing custom answers when fields arrive
  useEffect(() => {
    if (effectiveQuestionFields.length > 0) {
      setBatchAnswers((prev) => {
        const next = { ...prev };
        for (const f of effectiveQuestionFields) {
          const key = f.fieldKey || f.label;
          if (next[key] === undefined) {
            if (f.suggestedAnswer) {
              next[key] = f.suggestedAnswer;
            } else if (settings?.customAnswers?.[key]) {
              next[key] = settings.customAnswers[key];
            } else if (settings?.customAnswers?.[f.label]) {
              next[key] = settings.customAnswers[f.label];
            }
          }
        }
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [description, effectiveQuestionFields.length, settings]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isScreenshotModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsScreenshotModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isScreenshotModalOpen]);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        setSettings(data);
        setLoadingSettings(false);
        const lowerDesc = (description || '').toLowerCase();
        if (lowerDesc.includes('create account') || lowerDesc.includes('registration') || lowerDesc.includes('register')) {
          setAccountMode('create_account');
        } else if (data?.accountAuthMode) {
          setAccountMode(data.accountAuthMode === 'create_account' ? 'create_account' : 'sign_in');
        }
      })
      .catch(() => setLoadingSettings(false));
  }, [description]);

  const handleSettingsChange = (key: string, value: any) => {
    setSettings((prev: any) => ({ ...prev, [key]: value }));
  };

  async function saveSettings(extraData?: Record<string, any>) {
    if (!settings) return;
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          ...extraData,
        }),
      });
    } catch {
      // Non-fatal
    }
  }

  const isClosed =
    reason === 'job_closed' ||
    description.toLowerCase().includes('no longer accepting') ||
    description.toLowerCase().includes('no longer available') ||
    description.toLowerCase().includes('position closed') ||
    description.toLowerCase().includes('job closed') ||
    description.toLowerCase().includes('has expired') ||
    description.toLowerCase().includes('been filled') ||
    description.toLowerCase().includes('applications are closed') ||
    description.toLowerCase().includes('publication is closed') ||
    description.toLowerCase().includes('opening has been closed') ||
    description.toLowerCase().includes('not accepting applications');

  const isUnsupportedOrFatal =
    !isClosed && (
      reason === 'unexpected_page' ||
      reason === 'resume_rejected' ||
      reason === 'assessment_required' ||
      reason === 'application_destination_not_found' ||
      description.toLowerCase().includes('not currently supported') ||
      description.toLowerCase().includes('apply manually') ||
      description.toLowerCase().includes('cannot automate') ||
      description.toLowerCase().includes('unable to determine')
    );

  const isBotBlockReason =
    reason === 'captcha' ||
    reason === 'application_blocked_by_captcha' ||
    reason === 'application_blocked_by_bot_challenge' ||
    reason === 'application_blocked_by_security_challenge' ||
    description.toLowerCase().includes('bot verification') ||
    description.toLowerCase().includes('cloudflare') ||
    description.toLowerCase().includes('ddos protection') ||
    description.toLowerCase().includes('captcha') ||
    description.toLowerCase().includes('security check');

  async function resolve(res: 'completed' | 'skipped' | 'cancelled') {
    setResolving(true);
    setResolution(res);
    try {
      const answersMap: Record<string, string> = {};

      if (res === 'completed') {
        if (effectiveQuestionFields.length > 0) {
          for (const f of effectiveQuestionFields) {
            const key = f.fieldKey || f.label;
            const val = (batchAnswers[key] ?? '').trim();
            if (!val) continue;
            answersMap[key] = val;
            answersMap[f.label] = val;
            answersMap[f.label.replace(/\*/g, '').trim()] = val;
            // Store under normalized lowercase keys so the worker's
            // case-insensitive lookup always matches
            const normKey = key.replace(/\[\]$/, '').replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
            const normLabel = f.label.replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
            if (normKey !== key) answersMap[normKey] = val;
            if (normLabel !== f.label) answersMap[normLabel] = val;
          }
        } else if (customAnswer) {
          const qKey = questionData?.fieldKey || questionData?.label || 'answer';
          answersMap[qKey] = customAnswer;
          if (questionData?.label) {
            answersMap[questionData.label] = customAnswer;
          }
        }

        // If user wants to save answers for future applications, persist to DB via settings
        if (saveForFutureApplications && settings) {
          const extraPayload: Record<string, any> = {
            accountAuthMode: accountMode,
            emailAddress: settings.emailAddress,
            defaultAccountPassword: settings.defaultAccountPassword,
          };

          const mergedCustom = { ...(settings?.customAnswers || {}) };

          for (const [k, v] of Object.entries(answersMap)) {
            mergedCustom[k] = v;
            const lowerLabel = k.toLowerCase();
            if (/^city\b|\bcity\b/i.test(lowerLabel)) extraPayload.city = v;
            else if (/^state\b|\bstate\b|province/i.test(lowerLabel)) extraPayload.state = v;
            else if (/postal|zip\s*code/i.test(lowerLabel)) extraPayload.postalCode = v;
            else if (/address\s*(?:line\s*1)?|street\s*address/i.test(lowerLabel)) extraPayload.streetAddress = v;
            else if (/authorized|legally/i.test(lowerLabel)) extraPayload.usWorkAuthorization = v;
            else if (/sponsorship/i.test(lowerLabel)) extraPayload.visaSponsorship = v;
            else if (/gender|sex\b/i.test(lowerLabel) && !/transgender|identity/i.test(lowerLabel)) extraPayload.eeocGender = v;
            else if (/race|ethnicity|hispanic|latino/i.test(lowerLabel)) extraPayload.eeocRace = v;
            else if (/veteran|military/i.test(lowerLabel)) extraPayload.eeocVeteran = v;
            else if (/disability/i.test(lowerLabel)) extraPayload.eeocDisability = v;
          }

          extraPayload.customAnswers = mergedCustom;
          await saveSettings(extraPayload);
        }
      }

      const resolvePayload: Record<string, any> = {
        resolution: res,
        answers: answersMap,
        saveForFuture: saveForFutureApplications,
      };

      if (res === 'completed' && emailVerificationCode && emailVerificationCode.trim()) {
        const trimmed = emailVerificationCode.trim();
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          resolvePayload.verificationUrl = trimmed;
        } else {
          resolvePayload.otp = trimmed;
        }
      }

      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(resolvePayload),
      });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  async function handleDismissAndArchive() {
    setResolving(true);
    setResolution('skipped');
    try {
      if (jobId) {
        await fetch(`/api/jobs/${jobId}/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isArchived: true }),
        }).catch(() => {});
      }
      await fetch(`/api/auto-apply/interventions/${interventionId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'skipped' }),
      });
      onResolved();
    } finally {
      setResolving(false);
    }
  }

  function handleManualContinue() {
    if (pageUrl) {
      window.open(pageUrl, '_blank', 'noopener,noreferrer');
    }
    resolve('skipped');
  }

  const badgeColor = isClosed ? '#f87171' : isUnsupportedOrFatal ? '#fbbf24' : 'var(--accent-primary, #3b82f6)';
  const borderColor = isClosed
    ? 'rgba(239, 68, 68, 0.35)'
    : isUnsupportedOrFatal
    ? 'rgba(245, 158, 11, 0.35)'
    : 'var(--border-glass, rgba(255, 255, 255, 0.12))';
  const bgCard = isClosed
    ? 'rgba(239, 68, 68, 0.06)'
    : isUnsupportedOrFatal
    ? 'rgba(245, 158, 11, 0.06)'
    : 'rgba(255, 255, 255, 0.03)';

  return (
    <div
      className="intervention-panel-card"
      style={{
        background: bgCard,
        border: `1px solid ${borderColor}`,
        borderRadius: '12px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.15rem',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
      }}
      id={`intervention-panel-${interventionId}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        {getReasonIcon(reason, isClosed, isUnsupportedOrFatal)}
        <span style={{ fontWeight: 600, color: badgeColor, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
          {isClosed ? REASON_LABELS.job_closed : (REASON_LABELS[reason] ?? reason)}
        </span>
      </div>

      {(() => {
        let displayDesc = cleanDescription;
        if (isAuthReason) {
          displayDesc = `${portalDisplayName} requires you to sign in or create a candidate account before JAHQ can continue your application.`;
        } else if (reason === 'unknown_question') {
          const match = cleanDescription.match(/(?:requires your input|question):\s*["'“]?([^"'”\n]+)["'”]?/i);
          if (match && match[1]) {
            displayDesc = `I did not have enough information to answer: "${match[1].trim()}"`;
          }
        } else if (isClosed) {
          displayDesc = 'This job posting has been closed, filled, or is no longer accepting applications on the employer website.';
        }
        return (
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.5, fontWeight: 500 }}>
            {displayDesc}
          </p>
        );
      })()}

      {screenshotUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <ImageIcon size={14} /> Screen Capture
            </span>
            <button
              type="button"
              onClick={() => setIsScreenshotModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '0.3rem 0.65rem',
                borderRadius: '6px',
                border: '1px solid var(--border-glass, rgba(255,255,255,0.15))',
                background: 'var(--bg-primary, rgba(255,255,255,0.06))',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              id={`intervention-view-screenshot-btn-${interventionId}`}
              title="View larger version in focus modal"
            >
              <Maximize2 size={13} />
              <span>View Larger Screenshot</span>
            </button>
          </div>

          <div
            onClick={() => setIsScreenshotModalOpen(true)}
            style={{
              position: 'relative',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid var(--border-glass)',
              background: '#090d16',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxHeight: '220px',
            }}
            title="Click to view larger screenshot"
            id={`intervention-screenshot-preview-${interventionId}`}
          >
            <img
              src={screenshotUrl}
              alt="Screenshot of the job application screen"
              style={{
                maxHeight: '220px',
                width: '100%',
                objectFit: 'contain',
                display: 'block',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: '8px',
                right: '8px',
                background: 'rgba(0, 0, 0, 0.75)',
                color: '#ffffff',
                padding: '4px 8px',
                borderRadius: '5px',
                fontSize: '0.72rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontWeight: 500,
                pointerEvents: 'none',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            >
              <Maximize2 size={12} />
              <span>Click to enlarge</span>
            </div>
          </div>
        </div>
      )}

      {isClosed ? (
        <>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ShieldAlert size={16} /> Posting Status
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                The employer is no longer accepting submissions for this opening. You can archive this job to keep your tracker organized.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleDismissAndArchive}
              disabled={resolving}
              style={{
                flex: 2,
                minWidth: '180px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              }}
              id={`intervention-archive-${interventionId}`}
            >
              {resolving ? 'Archiving…' : 'Dismiss & Archive Job'}
            </button>
            {pageUrl && (
              <button
                className="btn-outline"
                onClick={() => window.open(pageUrl, '_blank', 'noopener,noreferrer')}
                style={{
                  flex: 1,
                  minWidth: '140px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.35rem',
                  padding: '0.65rem 1rem',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  border: '1px solid var(--border-glass)',
                  color: 'var(--text-primary)',
                  background: 'var(--background-card)',
                }}
                id={`intervention-view-page-${interventionId}`}
              >
                <ExternalLink size={14} /> View Posting
              </button>
            )}
            <button
              className="btn-outline"
              onClick={() => resolve('skipped')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                background: 'var(--background-card)',
              }}
              id={`intervention-dismiss-${interventionId}`}
            >
              Dismiss
            </button>
          </div>
        </>
      ) : isUnsupportedOrFatal ? (
        <>
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ArrowRight size={16} /> What to do next
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                Click <strong>Open Job & Finish Manually</strong> below to open this application directly in your browser.
              </span>
            </div>

            <div>
              <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <Zap size={16} color="#818cf8" /> What will happen next
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                The job application will launch in a new tab so you can complete the application directly. The automated runner will step aside and mark this task as completed.
              </span>
            </div>
          </div>

          <div className="auto-apply-button-group" style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            <button
              className="btn-primary"
              onClick={handleManualContinue}
              disabled={resolving}
              style={{
                flex: 2,
                minWidth: '200px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                padding: '0.65rem 1.25rem',
                fontSize: '0.88rem',
                fontWeight: 600,
                background: 'var(--primary)',
                color: 'var(--primary-foreground, #ffffff)',
                border: 'none',
                boxShadow: 'var(--shadow-md)',
              }}
              id={`intervention-manual-continue-${interventionId}`}
            >
              {resolving && resolution === 'skipped' ? 'Opening Job…' : <><ExternalLink size={16} color="#ffffff" /> Open Job & Finish Manually</>}
            </button>
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '130px',
                padding: '0.65rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                border: '1px solid var(--border-glass)',
                color: 'var(--text-primary)',
                background: 'var(--background-card)',
              }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel Auto Apply'}
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Candidate / Job Board Account Required: User Choice Flow */}
          {isAuthReason && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                background: 'var(--secondary, var(--card-header-bg))',
                border: '1px solid var(--border-glass)',
                borderRadius: '10px',
                padding: '1.1rem 1.25rem',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <Key size={16} color="var(--accent-primary, #3b82f6)" /> {providerInfo ? `${providerInfo.name} Account Option` : 'Candidate Account Option'}
                </label>
                <div className="auto-apply-button-group" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setAccountMode('sign_in')}
                    className={accountMode === 'sign_in' ? 'btn-primary' : 'btn-outline'}
                    style={{
                      padding: '0.55rem 1rem',
                      flex: 1,
                      minWidth: '130px',
                      textAlign: 'center',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                    id={`intervention-choice-signin-${interventionId}`}
                  >
                    <LogIn size={15} /> Yes, Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountMode('create_account')}
                    className={accountMode === 'create_account' ? 'btn-primary' : 'btn-outline'}
                    style={{
                      padding: '0.55rem 1rem',
                      flex: 1,
                      minWidth: '130px',
                      textAlign: 'center',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.45rem',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                    }}
                    id={`intervention-choice-create-${interventionId}`}
                  >
                    <UserPlus size={15} /> No, Create Account
                  </button>
                </div>
              </div>

              {/* Instructions Box */}
              <div style={{ padding: '1rem', background: 'var(--card, var(--background))', border: '1px solid var(--border-glass)', borderRadius: '8px' }}>
                <h4 style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: '0 0 0.5rem 0', fontWeight: 600 }}>
                  Instructions
                </h4>
                <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {accountMode === 'sign_in' ? (
                    <>
                      <li>Enter the email and password for your account on {providerInfo ? providerInfo.name : portalDisplayName}.</li>
                      <li>JAHQ will sign in securely on a residential proxy connection to complete and submit your application.</li>
                    </>
                  ) : (
                    <>
                      <li>{providerInfo ? providerInfo.name : portalDisplayName} requires a candidate account before continuing.</li>
                      <li>Enter your email and desired password. JAHQ will register the account and resume automation.</li>
                    </>
                  )}
                  <li>Credentials are stored securely in your profile for future 1-click applications.</li>
                </ul>
              </div>
            </div>
          )}

          {/* Contextual Guidance Banner */}
          <div
            style={{
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              background: 'var(--accent-glow, rgba(0, 112, 243, 0.08))',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              padding: '0.9rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              lineHeight: 1.5,
            }}
          >
            <div>
              <strong style={{ color: 'var(--accent-primary, #3b82f6)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <ArrowRight size={16} /> What to do next
              </strong>
              <span style={{ fontSize: '0.84rem', color: 'var(--text-primary)' }}>
                {isBotBlockReason
                  ? 'This site is protected by bot verification (Cloudflare / CAPTCHA). Click "Finish Manually" to open the job application directly in your browser.'
                  : isAuthReason
                  ? (accountMode === 'sign_in'
                      ? 'Enter the credentials for your existing account so JAHQ can sign in and continue your application.'
                      : `${portalDisplayName} requires a candidate account before you can continue. JAHQ will create the account using the credentials you provide, then resume your application.`)
                  : hasEffectiveQuestions
                  ? 'Answer the application question(s) below or complete them directly on the employer site.'
                  : 'Complete the verification or login directly on the job application page.'}
              </span>
            </div>

            <div>
              <strong style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', marginBottom: '0.15rem' }}>
                <Zap size={16} color="var(--accent-primary, #3b82f6)" /> What will happen next
              </strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {isBotBlockReason
                  ? 'Cloudflare protection blocks automated server sessions. Completing your application manually in your browser ensures it gets submitted without wasting automated retries.'
                  : isAuthReason
                  ? (accountMode === 'sign_in'
                      ? <>Click <strong>Sign In & Resume Application</strong> so JAHQ can authenticate and continue filling your application.</>
                      : <>Click <strong>Create Account & Resume</strong> so JAHQ can register your profile and submit your application.</>)
              : hasEffectiveQuestions
                  ? <>Once answered, click <strong>Resume Automation</strong> so the AI agent can fill out and submit your application with your answers.</>
                  : <>Once verified, click <strong>Resume Automation</strong> so the AI agent can automatically fill out and submit your application.</>}
              </span>
            </div>
          </div>

          {/* Job Application Questions Form */}
          {hasEffectiveQuestions && (
            <div
              style={{
                background: 'var(--secondary, var(--card-header-bg))',
                borderRadius: '10px',
                padding: '1.25rem',
                border: '1px solid var(--border-glass)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <HelpCircle size={17} color="var(--accent-primary, #3b82f6)" />
                  Application Questions
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  The application form requires input for the question{effectiveQuestionFields.length > 1 ? 's' : ''} below. Select or provide your answers to proceed.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {effectiveQuestionFields.map((q, idx) => {
                  const fieldKey = q.fieldKey || q.label;
                  const currentValue = batchAnswers[fieldKey] ?? (idx === 0 && customAnswer ? customAnswer : '');
                  const isRequired = q.required !== false;
                  const effectiveType = getEffectiveFieldType(q);
                  const dropdownOptions = getDropdownOptionsForField(q);

                  return (
                    <div
                      key={fieldKey || idx}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                        background: 'var(--card, var(--background))',
                        border: '1px solid var(--border-glass)',
                        borderRadius: '8px',
                        padding: '1rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4 }}>
                          {q.label} {isRequired ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 400 }}>(Optional)</span>}
                        </label>
                        <span style={{ fontSize: '0.72rem', padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                          {effectiveType}
                        </span>
                      </div>

                      {/* Render based on fieldType with 1:1 ATS input parity */}
                      {effectiveType === 'select' ? (
                        <select
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchAnswers((prev) => ({ ...prev, [fieldKey]: val }));
                            if (idx === 0) setCustomAnswer(val);
                          }}
                          style={{
                            background: 'var(--input, var(--background))',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            width: '100%',
                          }}
                        >
                          <option value="">Select an option...</option>
                          {dropdownOptions.map((opt, optIdx) => (
                            <option key={optIdx} value={opt}>{opt}</option>
                          ))}
                        </select>
                      ) : effectiveType === 'radio' && dropdownOptions.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {dropdownOptions.map((opt, optIdx) => {
                            const isSelected = Boolean(currentValue === opt || (Boolean(currentValue) && currentValue.toLowerCase() === opt.toLowerCase()));
                            const radioId = `radio-${fieldKey}-${optIdx}-${interventionId}`;
                            return (
                              <label
                                key={optIdx}
                                htmlFor={radioId}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.65rem',
                                  padding: '0.6rem 0.85rem',
                                  borderRadius: '8px',
                                  border: isSelected ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-glass)',
                                  background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--background-card)',
                                  cursor: 'pointer',
                                  transition: 'all 0.15s ease',
                                }}
                              >
                                <input
                                  type="radio"
                                  id={radioId}
                                  name={`radio-group-${fieldKey}-${interventionId}`}
                                  value={opt}
                                  checked={isSelected}
                                  onChange={() => {
                                    setBatchAnswers((prev) => ({ ...prev, [fieldKey]: opt }));
                                    if (idx === 0) setCustomAnswer(opt);
                                  }}
                                  style={{
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                    accentColor: 'var(--accent-primary, #3b82f6)',
                                  }}
                                />
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: isSelected ? 600 : 400 }}>
                                  {opt}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : effectiveType === 'checkbox' ? (
                        dropdownOptions.length > 1 ? (
                          // Multi-checkbox group
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {dropdownOptions.map((opt, optIdx) => {
                              const currentSelected = currentValue ? currentValue.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
                              const isChecked = currentSelected.includes(opt.toLowerCase());
                              const checkId = `check-${fieldKey}-${optIdx}-${interventionId}`;
                              return (
                                <label
                                  key={optIdx}
                                  htmlFor={checkId}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.65rem',
                                    padding: '0.55rem 0.85rem',
                                    borderRadius: '8px',
                                    border: isChecked ? '1px solid var(--accent-primary, #3b82f6)' : '1px solid var(--border-glass)',
                                    background: isChecked ? 'rgba(59, 130, 246, 0.08)' : 'var(--background-card)',
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    id={checkId}
                                    checked={isChecked}
                                    onChange={(e) => {
                                      const selectedArr = currentValue ? currentValue.split(',').map((s) => s.trim()).filter(Boolean) : [];
                                      let nextArr: string[];
                                      if (e.target.checked) {
                                        nextArr = [...selectedArr, opt];
                                      } else {
                                        nextArr = selectedArr.filter((s) => s.toLowerCase() !== opt.toLowerCase());
                                      }
                                      const nextVal = nextArr.join(', ');
                                      setBatchAnswers((prev) => ({ ...prev, [fieldKey]: nextVal }));
                                      if (idx === 0) setCustomAnswer(nextVal);
                                    }}
                                    style={{
                                      width: '18px',
                                      height: '18px',
                                      cursor: 'pointer',
                                      accentColor: 'var(--accent-primary, #3b82f6)',
                                    }}
                                  />
                                  <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: isChecked ? 600 : 400 }}>
                                    {opt}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          // Single checkbox (e.g. consent or confirmation)
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.65rem',
                              padding: '0.6rem 0.85rem',
                              borderRadius: '8px',
                              border: '1px solid var(--border-glass)',
                              background: 'var(--background-card)',
                              cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={currentValue === 'Yes' || currentValue === 'true' || currentValue === '1' || currentValue === 'agree'}
                              onChange={(e) => {
                                const val = e.target.checked ? 'Yes' : 'No';
                                setBatchAnswers((prev) => ({ ...prev, [fieldKey]: val }));
                                if (idx === 0) setCustomAnswer(val);
                              }}
                              style={{
                                width: '18px',
                                height: '18px',
                                cursor: 'pointer',
                                marginTop: '2px',
                                accentColor: 'var(--accent-primary, #3b82f6)',
                              }}
                            />
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                              I agree / acknowledge
                            </span>
                          </label>
                        )
                      ) : effectiveType === 'textarea' ? (
                        <textarea
                          rows={4}
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchAnswers((prev) => ({ ...prev, [fieldKey]: val }));
                            if (idx === 0) setCustomAnswer(val);
                          }}
                          placeholder="Type your answer here..."
                          style={{
                            background: 'var(--input, var(--background))',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            width: '100%',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                          }}
                        />
                      ) : effectiveType === 'date' ? (
                        <input
                          type="date"
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchAnswers((prev) => ({ ...prev, [fieldKey]: val }));
                            if (idx === 0) setCustomAnswer(val);
                          }}
                          style={{
                            background: 'var(--input, var(--background))',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            width: '100%',
                          }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => {
                            const val = e.target.value;
                            setBatchAnswers((prev) => ({ ...prev, [fieldKey]: val }));
                            if (idx === 0) setCustomAnswer(val);
                          }}
                          placeholder="Enter your answer..."
                          style={{
                            background: 'var(--input, var(--background))',
                            border: '1px solid var(--border-glass)',
                            color: 'var(--text-primary)',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                            width: '100%',
                          }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Save for future applications checkbox */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.65rem',
                  padding: '0.85rem 1rem',
                  background: 'var(--card, var(--background))',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  marginTop: '0.25rem',
                }}
              >
                <input
                  type="checkbox"
                  id={`save-future-checkbox-${interventionId}`}
                  checked={saveForFutureApplications}
                  onChange={(e) => setSaveForFutureApplications(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    cursor: 'pointer',
                    marginTop: '2px',
                    flexShrink: 0,
                    accentColor: 'var(--accent-primary, #3b82f6)',
                  }}
                />
                <label
                  htmlFor={`save-future-checkbox-${interventionId}`}
                  style={{
                    fontSize: '0.86rem',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    fontWeight: 500,
                    userSelect: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    lineHeight: 1.4,
                  }}
                >
                  <span style={{ fontWeight: 600 }}>Save answers for future applications</span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 400 }}>
                    When checked, these answers will be saved to your profile so the bot can automatically answer them in future applications.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Dedicated Security Code / MFA Verification Form */}
          {isMfaReason && !isAuthReason && (
            <div
              style={{
                background: 'var(--secondary, var(--card-header-bg))',
                borderRadius: '10px',
                padding: '1.25rem',
                border: '1px solid var(--border-glass)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <Smartphone size={17} color="#fbbf24" />
                  Security Verification Code Required
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {portalDisplayName} sent a verification security code to your email. Enter the code below to complete and submit your application.
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Security Code
                </label>
                <input
                  type="text"
                  value={emailVerificationCode}
                  onChange={(e) => setEmailVerificationCode(e.target.value)}
                  placeholder="e.g. NX6MTa6T or 6-digit code"
                  autoFocus
                  style={{
                    background: 'var(--input, var(--background))',
                    border: '1px solid var(--border-glass)',
                    color: 'var(--text-primary)',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    letterSpacing: '1px',
                    width: '100%',
                  }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Copy the code from the email sent by {portalDisplayName} and paste it here.
                </span>
              </div>
            </div>
          )}

          {/* Account Auth Credentials Form */}
          {isAuthReason && !loadingSettings && (
            <div
              style={{
                background: 'var(--secondary, var(--card-header-bg))',
                borderRadius: '10px',
                padding: '1.25rem',
                border: '1px solid var(--border-glass)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              <div>
                <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 600 }}>
                  <Key size={17} color="var(--accent-primary, #3b82f6)" />
                  {accountMode === 'sign_in' ? `Sign in to ${providerInfo ? providerInfo.name : 'Candidate'} Account` : `Create ${providerInfo ? providerInfo.name : 'Candidate'} Account`}
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                  {accountMode === 'sign_in'
                    ? `Enter the credentials for your ${providerInfo ? providerInfo.name : portalDisplayName} account so JAHQ can sign in and continue your application.`
                    : `${providerInfo ? providerInfo.name : portalDisplayName} requires a candidate account before you can continue. JAHQ will create the account using these credentials, then resume your application.`}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="auto-apply-input-group" style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '200px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Email Address</label>
                    <input
                      type="email"
                      value={settings?.emailAddress || ''}
                      onChange={(e) => handleSettingsChange('emailAddress', e.target.value)}
                      placeholder="user@example.com"
                      style={{
                        background: 'var(--input, var(--background))',
                        border: '1px solid var(--border-glass)',
                        color: 'var(--text-primary)',
                        padding: '0.75rem',
                        borderRadius: '8px',
                        fontSize: '0.875rem',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', flex: 1, minWidth: '200px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {accountMode === 'sign_in' ? 'Account Password' : 'New Account Password'}
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={settings?.defaultAccountPassword || ''}
                        onChange={(e) => handleSettingsChange('defaultAccountPassword', e.target.value)}
                        placeholder={accountMode === 'sign_in' ? 'Enter existing account password' : 'Enter desired password'}
                        style={{
                          width: '100%',
                          background: 'var(--input, var(--background))',
                          border: '1px solid var(--border-glass)',
                          color: 'var(--text-primary)',
                          padding: '0.75rem 2.5rem 0.75rem 0.75rem',
                          borderRadius: '8px',
                          fontSize: '0.875rem',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        style={{
                          position: 'absolute',
                          right: '0.75rem',
                          background: 'none',
                          border: 'none',
                          padding: '0.25rem',
                          cursor: 'pointer',
                          color: 'var(--text-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        title={showPassword ? 'Hide password' : 'Show password'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.25rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Email Verification Link or OTP Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={emailVerificationCode}
                    onChange={(e) => setEmailVerificationCode(e.target.value)}
                    placeholder="Paste activation URL or enter 6-digit code..."
                    style={{
                      background: 'var(--input, var(--background))',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--text-primary)',
                      padding: '0.75rem',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      width: '100%',
                    }}
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    If {portalDisplayName} sent a verification link or code to your email, paste it here to automatically complete verification.
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <Lock size={14} color="#10b981" />
                  <span>Credentials are protected and used only to submit your application.</span>
                </div>
              </div>
            </div>
          )}

          <div className="auto-apply-button-group" style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
            {isBotBlockReason ? (
              <>
                {pageUrl && (
                  <button
                    className="btn-primary"
                    onClick={handleManualContinue}
                    disabled={resolving}
                    style={{
                      flex: 2,
                      minWidth: '180px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      padding: '0.7rem 1.35rem',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      borderRadius: '8px',
                    }}
                    id={`intervention-switch-manual-${interventionId}`}
                  >
                    {resolving && resolution === 'skipped'
                      ? 'Opening Job…'
                      : (
                        <>
                          <ExternalLink size={16} /> Finish Application Manually
                        </>
                      )}
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="btn-primary"
                  onClick={() => resolve('completed')}
                  disabled={
                    resolving ||
                    (isAuthReason && (!settings?.defaultAccountPassword || !settings?.emailAddress)) ||
                    (isMfaReason && !isAuthReason && !emailVerificationCode.trim())
                  }
                  style={{
                    flex: 2,
                    minWidth: '180px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    padding: '0.7rem 1.35rem',
                    fontSize: '0.88rem',
                    fontWeight: 600,
                    borderRadius: '8px',
                  }}
                  id={`intervention-resolve-${interventionId}`}
                >
                  {resolving && resolution === 'completed'
                    ? 'Resuming…'
                    : (
                      <>
                        <Check size={16} color="#ffffff" />
                        {isAuthReason
                          ? (accountMode === 'sign_in' ? 'Sign In & Resume Application' : 'Create Account & Resume')
                          : isMfaReason
                            ? 'Submit Code & Continue'
                            : 'Resume Automation'}
                      </>
                    )}
                </button>
                {pageUrl && (
                  <button
                    className="btn-outline"
                    onClick={handleManualContinue}
                    disabled={resolving}
                    style={{
                      flex: 1,
                      minWidth: '140px',
                      padding: '0.7rem 1rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.35rem',
                      fontSize: '0.86rem',
                      fontWeight: 600,
                      borderRadius: '8px',
                    }}
                    title="Stop automated execution and apply directly in your browser"
                    id={`intervention-switch-manual-${interventionId}`}
                  >
                    {resolving && resolution === 'skipped' ? 'Opening Job…' : <><ExternalLink size={14} /> Finish Manually</>}
                  </button>
                )}
              </>
            )}
            <button
              className="btn-outline"
              onClick={() => setIsStreamModalOpen(true)}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '170px',
                padding: '0.7rem 1rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.45rem',
                fontSize: '0.86rem',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid #3b82f6',
                color: '#60a5fa',
                background: 'rgba(59, 130, 246, 0.12)',
              }}
              title="Open live cloud browser view to sign in (Google, 2FA, etc.) or solve challenge"
              id={`intervention-stream-btn-${interventionId}`}
            >
              <Radio size={14} className="animate-pulse" color="#60a5fa" /> Live Cloud Browser
            </button>
            <button
              className="btn-outline"
              onClick={() => resolve('cancelled')}
              disabled={resolving}
              style={{
                flex: 1,
                minWidth: '100px',
                padding: '0.7rem 1rem',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#f87171',
                background: 'rgba(239, 68, 68, 0.08)',
                fontSize: '0.86rem',
                fontWeight: 600,
                borderRadius: '8px',
              }}
              id={`intervention-cancel-${interventionId}`}
            >
              {resolving && resolution === 'cancelled' ? '…' : 'Cancel'}
            </button>
          </div>

        </>
      )}
      {/* Screenshot Focus Modal Portal */}
      {mounted && isScreenshotModalOpen && screenshotUrl && createPortal(
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.75)',
            padding: '1.25rem',
          }}
          onClick={() => setIsScreenshotModalOpen(false)}
          id={`intervention-screenshot-modal-${interventionId}`}
        >
          <div
            style={{
              background: 'var(--bg-primary, #0f172a)',
              color: 'var(--text-primary, #f8fafc)',
              borderRadius: '12px',
              maxWidth: '1000px',
              width: '100%',
              maxHeight: '92vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
              border: '1px solid var(--border-glass, #334155)',
              overflow: 'hidden',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.9rem 1.25rem',
                borderBottom: '1px solid var(--border-glass, rgba(255,255,255,0.1))',
                background: 'var(--bg-secondary, #1e293b)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
                <ImageIcon size={18} color="#818cf8" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Bot Captured Screenshot
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94a3b8)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
                  {REASON_LABELS[reason] || reason}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <a
                  href={screenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.8rem',
                    color: '#818cf8',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                  id={`intervention-modal-open-full-${interventionId}`}
                >
                  <ExternalLink size={14} /> Open Original in New Tab
                </a>
                <button
                  onClick={() => setIsScreenshotModalOpen(false)}
                  aria-label="Close screenshot focus modal"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary, #94a3b8)',
                    padding: '4px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  id={`intervention-modal-close-${interventionId}`}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div
              style={{
                padding: '1rem',
                overflowY: 'auto',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                background: '#090d16',
                flex: 1,
                maxHeight: 'calc(92vh - 65px)',
              }}
            >
              <img
                src={screenshotUrl}
                alt="Job application screen captured by bot - enlarged focus view"
                style={{
                  maxWidth: '100%',
                  maxHeight: 'calc(92vh - 90px)',
                  height: 'auto',
                  borderRadius: '6px',
                  objectFit: 'contain',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Connect Job Board Modal */}
      {providerInfo && (
        <ConnectJobBoardModal
          isOpen={isConnectModalOpen}
          onClose={() => setIsConnectModalOpen(false)}
          provider={providerInfo}
          onConnected={() => {
            setIsJobBoardConnected(true);
            setIsConnectModalOpen(false);
          }}
        />
      )}
      {/* Interactive Cloud Browser Stream Modal */}
      <InteractiveBrowserStream
        isOpen={isStreamModalOpen}
        onClose={() => setIsStreamModalOpen(false)}
        sessionId={sessionId || interventionId}
        interventionId={interventionId}
        portalName={providerInfo?.name || portalDisplayName}
        onResolved={() => {
          setIsStreamModalOpen(false);
          onResolved();
        }}
      />
    </div>
  );
}
