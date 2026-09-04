import { encrypt, decrypt } from './encryption';

export interface EmailAccountConfig {
  emailAddress: string;
  emailAppPassword?: string;
  imapHost: string;
  imapPort: number;
}

export type EmailAccountsMap = Record<string, EmailAccountConfig>;

export const DEFAULT_EMAIL_PROVIDERS = ['gmail', 'outlook', 'yahoo', 'icloud', 'other'] as const;
export type EmailProviderType = typeof DEFAULT_EMAIL_PROVIDERS[number];

export const DEFAULT_PROVIDER_CONFIGS: Record<string, { imapHost: string; imapPort: number; domain: string; displayName: string }> = {
  gmail: { imapHost: 'imap.gmail.com', imapPort: 993, domain: 'gmail.com', displayName: 'Gmail' },
  outlook: { imapHost: 'outlook.office365.com', imapPort: 993, domain: 'outlook.com', displayName: 'Microsoft' },
  yahoo: { imapHost: 'imap.mail.yahoo.com', imapPort: 993, domain: 'yahoo.com', displayName: 'Yahoo' },
  icloud: { imapHost: 'imap.mail.me.com', imapPort: 993, domain: 'icloud.com', displayName: 'Apple ID' },
  other: { imapHost: '', imapPort: 993, domain: 'example.com', displayName: 'Email' },
};

/**
 * Infers provider key from imapHost or emailAddress
 */
export function inferEmailProvider(imapHost?: string | null, emailAddress?: string | null): EmailProviderType {
  const host = (imapHost || '').toLowerCase();
  const email = (emailAddress || '').toLowerCase();

  if (host.includes('gmail') || email.endsWith('@gmail.com') || email.endsWith('@googlemail.com')) {
    return 'gmail';
  }
  if (host.includes('outlook') || host.includes('office365') || host.includes('hotmail') || email.endsWith('@outlook.com') || email.endsWith('@hotmail.com') || email.endsWith('@live.com')) {
    return 'outlook';
  }
  if (host.includes('yahoo') || email.endsWith('@yahoo.com') || email.endsWith('@ymail.com')) {
    return 'yahoo';
  }
  if (host.includes('icloud') || host.includes('me.com') || host.includes('mac.com') || email.endsWith('@icloud.com') || email.endsWith('@me.com') || email.endsWith('@mac.com')) {
    return 'icloud';
  }
  return 'other';
}

/**
 * Resolves a complete map of email accounts from user preferences,
 * populating defaults and safely migrating legacy single-account fields.
 */
export function resolveEmailAccounts(prefs: any, maskPasswords = false): EmailAccountsMap {
  const accounts: EmailAccountsMap = {};

  // 1. Initialize all default providers with standard fallback templates
  for (const provider of DEFAULT_EMAIL_PROVIDERS) {
    accounts[provider] = {
      emailAddress: '',
      emailAppPassword: '',
      imapHost: DEFAULT_PROVIDER_CONFIGS[provider].imapHost,
      imapPort: DEFAULT_PROVIDER_CONFIGS[provider].imapPort,
    };
  }

  // 2. Load stored accounts from sources.emailAccounts or prefs.emailAccounts
  const storedAccounts = (prefs?.sources?.emailAccounts || prefs?.emailAccounts) as EmailAccountsMap | undefined;
  if (storedAccounts && typeof storedAccounts === 'object') {
    for (const [provider, config] of Object.entries(storedAccounts)) {
      if (config && typeof config === 'object') {
        const defaultConfig = DEFAULT_PROVIDER_CONFIGS[provider] || DEFAULT_PROVIDER_CONFIGS.other;
        accounts[provider] = {
          emailAddress: (config.emailAddress || '').trim(),
          emailAppPassword: config.emailAppPassword || '',
          imapHost: config.imapHost || defaultConfig.imapHost,
          imapPort: Number(config.imapPort) || defaultConfig.imapPort,
        };
      }
    }
  }

  // 3. Backward compatibility: if no accounts are configured in emailAccounts, check legacy fields
  const hasConfiguredAccount = Object.values(accounts).some(acc => !!acc.emailAddress);
  if (!hasConfiguredAccount && prefs?.emailAddress) {
    const legacyProvider = inferEmailProvider(prefs.imapHost, prefs.emailAddress);
    accounts[legacyProvider] = {
      emailAddress: (prefs.emailAddress || '').trim(),
      emailAppPassword: prefs.emailAppPassword || '',
      imapHost: prefs.imapHost || DEFAULT_PROVIDER_CONFIGS[legacyProvider].imapHost,
      imapPort: Number(prefs.imapPort) || DEFAULT_PROVIDER_CONFIGS[legacyProvider].imapPort,
    };
  }

  // 4. Optionally mask passwords for API responses to the frontend
  if (maskPasswords) {
    for (const provider of Object.keys(accounts)) {
      if (accounts[provider].emailAppPassword) {
        accounts[provider].emailAppPassword = '********';
      }
    }
  }

  return accounts;
}

/**
 * Encrypts new passwords, preserves existing passwords when '********' is sent,
 * and determines the primary account for backwards compatibility.
 */
export function encryptAndMergeEmailAccounts(
  existingAccounts: EmailAccountsMap,
  incomingAccounts: EmailAccountsMap
): { accountsToSave: EmailAccountsMap; primaryAccount: EmailAccountConfig | null } {
  const accountsToSave: EmailAccountsMap = {};

  // Process each incoming provider account
  for (const [provider, incoming] of Object.entries(incomingAccounts || {})) {
    if (!incoming || typeof incoming !== 'object') continue;

    const existing = existingAccounts?.[provider];
    const defaultConfig = DEFAULT_PROVIDER_CONFIGS[provider] || DEFAULT_PROVIDER_CONFIGS.other;

    const emailAddress = (incoming.emailAddress || '').trim();
    let emailAppPassword = incoming.emailAppPassword || '';

    if (emailAppPassword === '********') {
      // Preserve existing encrypted password from DB
      emailAppPassword = existing?.emailAppPassword || '';
    } else if (emailAppPassword && emailAppPassword.trim().length > 0) {
      // New plaintext password entered -> encrypt
      emailAppPassword = encrypt(emailAppPassword.trim());
    } else {
      emailAppPassword = '';
    }

    accountsToSave[provider] = {
      emailAddress,
      emailAppPassword,
      imapHost: (incoming.imapHost || defaultConfig.imapHost).trim(),
      imapPort: Number(incoming.imapPort) || defaultConfig.imapPort,
    };
  }

  // Make sure all default providers exist in the saved map
  for (const provider of DEFAULT_EMAIL_PROVIDERS) {
    if (!accountsToSave[provider]) {
      const existing = existingAccounts?.[provider];
      const defaultConfig = DEFAULT_PROVIDER_CONFIGS[provider];
      accountsToSave[provider] = {
        emailAddress: existing?.emailAddress || '',
        emailAppPassword: existing?.emailAppPassword || '',
        imapHost: existing?.imapHost || defaultConfig.imapHost,
        imapPort: existing?.imapPort || defaultConfig.imapPort,
      };
    }
  }

  // Find primary account (first configured account with valid email & password)
  let primaryAccount: EmailAccountConfig | null = null;
  for (const provider of DEFAULT_EMAIL_PROVIDERS) {
    const acc = accountsToSave[provider];
    if (acc && acc.emailAddress && acc.emailAppPassword) {
      primaryAccount = acc;
      break;
    }
  }

  return { accountsToSave, primaryAccount };
}

/**
 * Extracts and decrypts all active email accounts configured for a user.
 */
export function getActiveEmailAccounts(prefs: any): Array<{
  provider: string;
  emailAddress: string;
  emailAppPasswordDecrypted: string;
  imapHost: string;
  imapPort: number;
}> {
  const resolved = resolveEmailAccounts(prefs, false);
  const active: Array<{
    provider: string;
    emailAddress: string;
    emailAppPasswordDecrypted: string;
    imapHost: string;
    imapPort: number;
  }> = [];

  for (const [provider, config] of Object.entries(resolved)) {
    if (config.emailAddress && config.emailAppPassword) {
      const decryptedPass = decrypt(config.emailAppPassword);
      if (decryptedPass) {
        active.push({
          provider,
          emailAddress: config.emailAddress,
          emailAppPasswordDecrypted: decryptedPass,
          imapHost: config.imapHost,
          imapPort: config.imapPort,
        });
      }
    }
  }

  return active;
}
