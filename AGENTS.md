<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI Overlay Modal Conventions
- **Viewport Centering**: All overlay modals MUST be centered relative to the browser viewport (`position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 9999;`). Always use `createPortal(modalContent, document.body)` so modals attach to the root `document.body` and never get trapped in scrolled/transformed parent containers.
- **No Background Blur**: Overlay backdrops MUST NOT use `backdrop-filter: blur(...)` or `backdropFilter: 'blur(...)'`. Use a clean solid/semi-transparent background overlay (e.g. `rgba(0, 0, 0, 0.6)`).

# Content Writing Rules
When writing or rewriting content for resumes, cover letters, networking messages, or Q&A:
- **Role-Play**: Role-play as an experienced professional.
- **No Dashes or Hyphens as Punctuation**: Do not use em-dashes ("—" or "--") or hyphens ("-") as punctuation to separate clauses. Use commas, periods, or natural phrasing instead.
- **No AI Filler Words & Word Salad**: Avoid generic, robotic AI filler words like "thrilled," "passionate," "dynamic," "testament to," or "delve." Never use rambling, dramatic storybook preambles or rhetorical scenario openers (e.g. "A safe contractor waiting weeks...").
- **Avoid Overly Ambitious Adverbs & AI Formulas**: Avoid formulaic phrases like "directly aligns with", "gives me a direct line into everything this role requires", or "taking on one of the hardest parts of". Use natural, grounded phrasing instead (e.g. "aligns with my background in...", "connects with my work in...", "fits my experience in...").
- **Cover Letter Structure**: Split cover letters into exactly three short paragraphs:
  - Paragraph 1 (2-3 sentences max): Direct, punchy application stating the exact role and company, your highest-level qualification/years of experience, and how your core strengths connect with their product focus. Start directly without fictional scenarios or rambling setup.
  - Paragraph 2: Focus on why what you did was important and how it benefited the company and/or users (e.g. solving core operational bottlenecks, eliminating user friction, or unblocking growth), connecting those proven outcomes to the job description rather than simply listing resume achievements.
  - Paragraph 3: A direct call to action for an interview.
- **Creativity / Temperature**: Set creativity/temperature to 1.5 to ensure natural sentence variation.
- **Tone and Energy (CRITICAL)**: Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational—like a passionate professional writing to a respected colleague. Do not sound dry, corporate, or overly formal. Inject natural excitement while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.

# Infrastructure & Deployment Conventions
- **Production Server & Services**: The Next.js web app, database, and background auto-apply worker are all hosted as services on **Railway**.
- **Deployment**: Pushes to `main` automatically trigger builds and deployments across Railway services.

# Engineering Integrity & Implementation Standards
- **No Unannounced Simulations or Stubs**: NEVER present simulated solutions, mock tokens, stubs, or fake verifications without explicitly highlighting them as simulated, stubs, or placeholders.
- **Explicit Permission Required**: NEVER include simulated, stubbed, or mock solutions in implementation plans or proposed architectures without first asking the user for permission and receiving explicit approval. Real, functioning implementations must always be the default standard.

