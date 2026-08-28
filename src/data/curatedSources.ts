/**
 * src/data/curatedSources.ts
 *
 * Seed registry of 100+ verified direct corporate career portals across modern ATS platforms.
 */

export interface CuratedEmployerSource {
  name: string;
  domain: string;
  careerUrl: string;
  atsPlatform: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'smartrecruiters' | 'workday';
  atsCompanySlug: string;
}

export const CURATED_EMPLOYER_SOURCES: CuratedEmployerSource[] = [
  // ─── Workday Enterprise Employers ──────────────────────────────────────────
  { name: 'Nvidia', domain: 'nvidia.com', careerUrl: 'https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite', atsPlatform: 'workday', atsCompanySlug: 'nvidia' },
  { name: 'Comcast', domain: 'comcast.com', careerUrl: 'https://comcast.wd115.myworkdayjobs.com/Comcast_Careers', atsPlatform: 'workday', atsCompanySlug: 'comcast' },
  { name: 'Salesforce', domain: 'salesforce.com', careerUrl: 'https://salesforce.wd12.myworkdayjobs.com/External_Career_Site', atsPlatform: 'workday', atsCompanySlug: 'salesforce' },
  { name: 'Adobe', domain: 'adobe.com', careerUrl: 'https://adobe.wd5.myworkdayjobs.com/external_experienced', atsPlatform: 'workday', atsCompanySlug: 'adobe' },
  { name: 'Target', domain: 'target.com', careerUrl: 'https://target.wd5.myworkdayjobs.com/targetcareers', atsPlatform: 'workday', atsCompanySlug: 'target' },
  { name: 'Walmart', domain: 'walmart.com', careerUrl: 'https://walmart.wd5.myworkdayjobs.com/WalmartExternal', atsPlatform: 'workday', atsCompanySlug: 'walmart' },
  { name: 'Capital One', domain: 'capitalone.com', careerUrl: 'https://capitalone.wd1.myworkdayjobs.com/Capital_One', atsPlatform: 'workday', atsCompanySlug: 'capitalone' },
  { name: 'Workday', domain: 'workday.com', careerUrl: 'https://workday.wd5.myworkdayjobs.com/Workday', atsPlatform: 'workday', atsCompanySlug: 'workday' },
  { name: 'Autodesk', domain: 'autodesk.com', careerUrl: 'https://autodesk.wd1.myworkdayjobs.com/Ext', atsPlatform: 'workday', atsCompanySlug: 'autodesk' },
  { name: 'Cisco', domain: 'cisco.com', careerUrl: 'https://cisco.wd5.myworkdayjobs.com/CiscoJobs', atsPlatform: 'workday', atsCompanySlug: 'cisco' },
  { name: 'Intuit', domain: 'intuit.com', careerUrl: 'https://intuit.wd5.myworkdayjobs.com/Early_Careers', atsPlatform: 'workday', atsCompanySlug: 'intuit' },
  { name: 'eBay', domain: 'ebay.com', careerUrl: 'https://ebay.wd5.myworkdayjobs.com/apply', atsPlatform: 'workday', atsCompanySlug: 'ebay' },
  { name: 'PayPal', domain: 'paypal.com', careerUrl: 'https://paypal.wd1.myworkdayjobs.com/jobs', atsPlatform: 'workday', atsCompanySlug: 'paypal' },
  { name: 'HP', domain: 'hp.com', careerUrl: 'https://hp.wd5.myworkdayjobs.com/ExternalCareerSite', atsPlatform: 'workday', atsCompanySlug: 'hp' },
  { name: 'Mastercard', domain: 'mastercard.com', careerUrl: 'https://mastercard.wd1.myworkdayjobs.com/CorporateCareers', atsPlatform: 'workday', atsCompanySlug: 'mastercard' },
  { name: 'Nike', domain: 'nike.com', careerUrl: 'https://nike.wd1.myworkdayjobs.com/Nike', atsPlatform: 'workday', atsCompanySlug: 'nike' },
  { name: 'Sony', domain: 'sony.com', careerUrl: 'https://sony.wd1.myworkdayjobs.com/Sony_Careers', atsPlatform: 'workday', atsCompanySlug: 'sony' },

  // ─── Greenhouse Employers ──────────────────────────────────────────────────
  { name: 'Stripe', domain: 'stripe.com', careerUrl: 'https://boards.greenhouse.io/stripe', atsPlatform: 'greenhouse', atsCompanySlug: 'stripe' },
  { name: 'Airbnb', domain: 'airbnb.com', careerUrl: 'https://boards.greenhouse.io/airbnb', atsPlatform: 'greenhouse', atsCompanySlug: 'airbnb' },
  { name: 'Datadog', domain: 'datadoghq.com', careerUrl: 'https://boards.greenhouse.io/datadog', atsPlatform: 'greenhouse', atsCompanySlug: 'datadog' },
  { name: 'Cloudflare', domain: 'cloudflare.com', careerUrl: 'https://boards.greenhouse.io/cloudflare', atsPlatform: 'greenhouse', atsCompanySlug: 'cloudflare' },
  { name: 'Figma', domain: 'figma.com', careerUrl: 'https://boards.greenhouse.io/figma', atsPlatform: 'greenhouse', atsCompanySlug: 'figma' },
  { name: 'Reddit', domain: 'reddit.com', careerUrl: 'https://boards.greenhouse.io/reddit', atsPlatform: 'greenhouse', atsCompanySlug: 'reddit' },
  { name: 'Twilio', domain: 'twilio.com', careerUrl: 'https://boards.greenhouse.io/twilio', atsPlatform: 'greenhouse', atsCompanySlug: 'twilio' },
  { name: 'Robinhood', domain: 'robinhood.com', careerUrl: 'https://boards.greenhouse.io/robinhood', atsPlatform: 'greenhouse', atsCompanySlug: 'robinhood' },
  { name: 'DoorDash', domain: 'doordash.com', careerUrl: 'https://boards.greenhouse.io/doordash', atsPlatform: 'greenhouse', atsCompanySlug: 'doordash' },
  { name: 'Instacart', domain: 'instacart.com', careerUrl: 'https://boards.greenhouse.io/instacart', atsPlatform: 'greenhouse', atsCompanySlug: 'instacart' },
  { name: 'Pinterest', domain: 'pinterest.com', careerUrl: 'https://boards.greenhouse.io/pinterest', atsPlatform: 'greenhouse', atsCompanySlug: 'pinterest' },
  { name: 'Lyft', domain: 'lyft.com', careerUrl: 'https://boards.greenhouse.io/lyft', atsPlatform: 'greenhouse', atsCompanySlug: 'lyft' },
  { name: 'Coinbase', domain: 'coinbase.com', careerUrl: 'https://boards.greenhouse.io/coinbase', atsPlatform: 'greenhouse', atsCompanySlug: 'coinbase' },
  { name: 'Brex', domain: 'brex.com', careerUrl: 'https://boards.greenhouse.io/brex', atsPlatform: 'greenhouse', atsCompanySlug: 'brex' },
  { name: 'Ramp', domain: 'ramp.com', careerUrl: 'https://boards.greenhouse.io/ramp', atsPlatform: 'greenhouse', atsCompanySlug: 'ramp' },
  { name: 'Dropbox', domain: 'dropbox.com', careerUrl: 'https://boards.greenhouse.io/dropbox', atsPlatform: 'greenhouse', atsCompanySlug: 'dropbox' },
  { name: 'Box', domain: 'box.com', careerUrl: 'https://boards.greenhouse.io/box', atsPlatform: 'greenhouse', atsCompanySlug: 'box' },
  { name: 'Zoom', domain: 'zoom.us', careerUrl: 'https://boards.greenhouse.io/zoom', atsPlatform: 'greenhouse', atsCompanySlug: 'zoom' },
  { name: 'MongoDB', domain: 'mongodb.com', careerUrl: 'https://boards.greenhouse.io/mongodb', atsPlatform: 'greenhouse', atsCompanySlug: 'mongodb' },
  { name: 'HashiCorp', domain: 'hashicorp.com', careerUrl: 'https://boards.greenhouse.io/hashicorp', atsPlatform: 'greenhouse', atsCompanySlug: 'hashicorp' },
  { name: 'Gusto', domain: 'gusto.com', careerUrl: 'https://boards.greenhouse.io/gusto', atsPlatform: 'greenhouse', atsCompanySlug: 'gusto' },
  { name: 'Notion', domain: 'notion.so', careerUrl: 'https://boards.greenhouse.io/notion', atsPlatform: 'greenhouse', atsCompanySlug: 'notion' },
  { name: 'Asana', domain: 'asana.com', careerUrl: 'https://boards.greenhouse.io/asana', atsPlatform: 'greenhouse', atsCompanySlug: 'asana' },
  { name: 'HubSpot', domain: 'hubspot.com', careerUrl: 'https://boards.greenhouse.io/hubspot', atsPlatform: 'greenhouse', atsCompanySlug: 'hubspot' },
  { name: 'Webflow', domain: 'webflow.com', careerUrl: 'https://boards.greenhouse.io/webflow', atsPlatform: 'greenhouse', atsCompanySlug: 'webflow' },
  { name: 'Plaid', domain: 'plaid.com', careerUrl: 'https://boards.greenhouse.io/plaid', atsPlatform: 'greenhouse', atsCompanySlug: 'plaid' },
  { name: 'Checkr', domain: 'checkr.com', careerUrl: 'https://boards.greenhouse.io/checkr', atsPlatform: 'greenhouse', atsCompanySlug: 'checkr' },
  { name: 'Rippling', domain: 'rippling.com', careerUrl: 'https://boards.greenhouse.io/rippling', atsPlatform: 'greenhouse', atsCompanySlug: 'rippling' },
  { name: 'Retool', domain: 'retool.com', careerUrl: 'https://boards.greenhouse.io/retool', atsPlatform: 'greenhouse', atsCompanySlug: 'retool' },
  { name: 'Miro', domain: 'miro.com', careerUrl: 'https://boards.greenhouse.io/miro', atsPlatform: 'greenhouse', atsCompanySlug: 'miro' },
  { name: 'Zapier', domain: 'zapier.com', careerUrl: 'https://boards.greenhouse.io/zapier', atsPlatform: 'greenhouse', atsCompanySlug: 'zapier' },
  { name: 'ClickUp', domain: 'clickup.com', careerUrl: 'https://boards.greenhouse.io/clickup', atsPlatform: 'greenhouse', atsCompanySlug: 'clickup' },
  { name: 'Okta', domain: 'okta.com', careerUrl: 'https://boards.greenhouse.io/okta', atsPlatform: 'greenhouse', atsCompanySlug: 'okta' },
  { name: 'Snyk', domain: 'snyk.io', careerUrl: 'https://boards.greenhouse.io/snyk', atsPlatform: 'greenhouse', atsCompanySlug: 'snyk' },

  // ─── Lever Employers ───────────────────────────────────────────────────────
  { name: 'Palantir', domain: 'palantir.com', careerUrl: 'https://jobs.lever.co/palantir', atsPlatform: 'lever', atsCompanySlug: 'palantir' },
  { name: 'Spotify', domain: 'spotify.com', careerUrl: 'https://jobs.lever.co/spotify', atsPlatform: 'lever', atsCompanySlug: 'spotify' },
  { name: 'Automattic', domain: 'automattic.com', careerUrl: 'https://jobs.lever.co/automattic', atsPlatform: 'lever', atsCompanySlug: 'automattic' },
  { name: 'Docker', domain: 'docker.com', careerUrl: 'https://jobs.lever.co/docker', atsPlatform: 'lever', atsCompanySlug: 'docker' },
  { name: 'GitLab', domain: 'gitlab.com', careerUrl: 'https://jobs.lever.co/gitlab', atsPlatform: 'lever', atsCompanySlug: 'gitlab' },
  { name: 'Eventbrite', domain: 'eventbrite.com', careerUrl: 'https://jobs.lever.co/eventbrite', atsPlatform: 'lever', atsCompanySlug: 'eventbrite' },
  { name: 'Affirm', domain: 'affirm.com', careerUrl: 'https://jobs.lever.co/affirm', atsPlatform: 'lever', atsCompanySlug: 'affirm' },
  { name: 'Unity', domain: 'unity.com', careerUrl: 'https://jobs.lever.co/unity3d', atsPlatform: 'lever', atsCompanySlug: 'unity3d' },
  { name: 'Medium', domain: 'medium.com', careerUrl: 'https://jobs.lever.co/medium', atsPlatform: 'lever', atsCompanySlug: 'medium' },
  { name: 'Carta', domain: 'carta.com', careerUrl: 'https://jobs.lever.co/carta', atsPlatform: 'lever', atsCompanySlug: 'carta' },
  { name: 'Coupa', domain: 'coupa.com', careerUrl: 'https://jobs.lever.co/coupa', atsPlatform: 'lever', atsCompanySlug: 'coupa' },

  // ─── Ashby Employers (AI & Modern Tech Vanguard) ───────────────────────────
  { name: 'OpenAI', domain: 'openai.com', careerUrl: 'https://jobs.ashbyhq.com/openai', atsPlatform: 'ashby', atsCompanySlug: 'openai' },
  { name: 'Anthropic', domain: 'anthropic.com', careerUrl: 'https://jobs.ashbyhq.com/anthropic', atsPlatform: 'ashby', atsCompanySlug: 'anthropic' },
  { name: 'Scale AI', domain: 'scale.com', careerUrl: 'https://jobs.ashbyhq.com/scale', atsPlatform: 'ashby', atsCompanySlug: 'scale' },
  { name: 'Linear', domain: 'linear.app', careerUrl: 'https://jobs.ashbyhq.com/linear', atsPlatform: 'ashby', atsCompanySlug: 'linear' },
  { name: 'Vercel', domain: 'vercel.com', careerUrl: 'https://jobs.ashbyhq.com/vercel', atsPlatform: 'ashby', atsCompanySlug: 'vercel' },
  { name: 'Replit', domain: 'replit.com', careerUrl: 'https://jobs.ashbyhq.com/replit', atsPlatform: 'ashby', atsCompanySlug: 'replit' },
  { name: 'Supabase', domain: 'supabase.com', careerUrl: 'https://jobs.ashbyhq.com/supabase', atsPlatform: 'ashby', atsCompanySlug: 'supabase' },
  { name: 'PostHog', domain: 'posthog.com', careerUrl: 'https://jobs.ashbyhq.com/posthog', atsPlatform: 'ashby', atsCompanySlug: 'posthog' },
  { name: 'Resend', domain: 'resend.com', careerUrl: 'https://jobs.ashbyhq.com/resend', atsPlatform: 'ashby', atsCompanySlug: 'resend' },
  { name: 'Perplexity AI', domain: 'perplexity.ai', careerUrl: 'https://jobs.ashbyhq.com/perplexity', atsPlatform: 'ashby', atsCompanySlug: 'perplexity' },
  { name: 'Cognition', domain: 'cognition.ai', careerUrl: 'https://jobs.ashbyhq.com/cognition', atsPlatform: 'ashby', atsCompanySlug: 'cognition' },
  { name: 'Modal', domain: 'modal.com', careerUrl: 'https://jobs.ashbyhq.com/modal', atsPlatform: 'ashby', atsCompanySlug: 'modal' },
  { name: 'Weights & Biases', domain: 'wandb.ai', careerUrl: 'https://jobs.ashbyhq.com/wandb', atsPlatform: 'ashby', atsCompanySlug: 'wandb' },
  { name: 'ElevenLabs', domain: 'elevenlabs.io', careerUrl: 'https://jobs.ashbyhq.com/elevenlabs', atsPlatform: 'ashby', atsCompanySlug: 'elevenlabs' },
  { name: 'Runway', domain: 'runwayml.com', careerUrl: 'https://jobs.ashbyhq.com/runway', atsPlatform: 'ashby', atsCompanySlug: 'runway' },
  { name: 'Synthesia', domain: 'synthesia.io', careerUrl: 'https://jobs.ashbyhq.com/synthesia', atsPlatform: 'ashby', atsCompanySlug: 'synthesia' },
  { name: 'Together AI', domain: 'together.ai', careerUrl: 'https://jobs.ashbyhq.com/together-ai', atsPlatform: 'ashby', atsCompanySlug: 'together-ai' },
  { name: 'Mistral AI', domain: 'mistral.ai', careerUrl: 'https://jobs.ashbyhq.com/mistral', atsPlatform: 'ashby', atsCompanySlug: 'mistral' },
  { name: 'Character AI', domain: 'character.ai', careerUrl: 'https://jobs.ashbyhq.com/character', atsPlatform: 'ashby', atsCompanySlug: 'character' },
  { name: 'Pinecone', domain: 'pinecone.io', careerUrl: 'https://jobs.ashbyhq.com/pinecone', atsPlatform: 'ashby', atsCompanySlug: 'pinecone' },
  { name: 'LangChain', domain: 'langchain.com', careerUrl: 'https://jobs.ashbyhq.com/langchain', atsPlatform: 'ashby', atsCompanySlug: 'langchain' },
  { name: 'Fireworks AI', domain: 'fireworks.ai', careerUrl: 'https://jobs.ashbyhq.com/fireworks', atsPlatform: 'ashby', atsCompanySlug: 'fireworks' },
  { name: 'Cohere', domain: 'cohere.com', careerUrl: 'https://jobs.ashbyhq.com/cohere', atsPlatform: 'ashby', atsCompanySlug: 'cohere' },
  { name: 'Harvey', domain: 'harvey.ai', careerUrl: 'https://jobs.ashbyhq.com/harvey', atsPlatform: 'ashby', atsCompanySlug: 'harvey' },

  // ─── Workable Employers ────────────────────────────────────────────────────
  { name: 'Bitpanda', domain: 'bitpanda.com', careerUrl: 'https://apply.workable.com/bitpanda', atsPlatform: 'workable', atsCompanySlug: 'bitpanda' },
  { name: 'Gorgias', domain: 'gorgias.com', careerUrl: 'https://apply.workable.com/gorgias', atsPlatform: 'workable', atsCompanySlug: 'gorgias' },
  { name: 'Printify', domain: 'printify.com', careerUrl: 'https://apply.workable.com/printify', atsPlatform: 'workable', atsCompanySlug: 'printify' },
  { name: 'InVision', domain: 'invisionapp.com', careerUrl: 'https://apply.workable.com/invisionapp', atsPlatform: 'workable', atsCompanySlug: 'invisionapp' },
  { name: 'Typeform', domain: 'typeform.com', careerUrl: 'https://apply.workable.com/typeform', atsPlatform: 'workable', atsCompanySlug: 'typeform' },
  { name: 'WeTransfer', domain: 'wetransfer.com', careerUrl: 'https://apply.workable.com/wetransfer', atsPlatform: 'workable', atsCompanySlug: 'wetransfer' },
  { name: 'Taxfix', domain: 'taxfix.de', careerUrl: 'https://apply.workable.com/taxfix', atsPlatform: 'workable', atsCompanySlug: 'taxfix' },

  // ─── SmartRecruiters Employers ─────────────────────────────────────────────
  { name: 'Ubisoft', domain: 'ubisoft.com', careerUrl: 'https://careers.smartrecruiters.com/Ubisoft2', atsPlatform: 'smartrecruiters', atsCompanySlug: 'Ubisoft2' },
  { name: 'Twitter / X', domain: 'x.com', careerUrl: 'https://careers.smartrecruiters.com/Twitter2', atsPlatform: 'smartrecruiters', atsCompanySlug: 'Twitter2' },
  { name: 'SmartRecruiters', domain: 'smartrecruiters.com', careerUrl: 'https://careers.smartrecruiters.com/SmartRecruiters', atsPlatform: 'smartrecruiters', atsCompanySlug: 'SmartRecruiters' },
  { name: 'Skechers', domain: 'skechers.com', careerUrl: 'https://careers.smartrecruiters.com/Skechers', atsPlatform: 'smartrecruiters', atsCompanySlug: 'Skechers' },
  { name: 'Equinox', domain: 'equinox.com', careerUrl: 'https://careers.smartrecruiters.com/Equinox', atsPlatform: 'smartrecruiters', atsCompanySlug: 'Equinox' },
  { name: 'Avery Dennison', domain: 'averydennison.com', careerUrl: 'https://careers.smartrecruiters.com/AveryDennison', atsPlatform: 'smartrecruiters', atsCompanySlug: 'AveryDennison' },
  { name: 'Bosch', domain: 'bosch.com', careerUrl: 'https://careers.smartrecruiters.com/BoschGroup', atsPlatform: 'smartrecruiters', atsCompanySlug: 'BoschGroup' },
];
