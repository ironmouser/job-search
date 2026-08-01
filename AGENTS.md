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
- **No AI Filler Words**: Avoid generic, robotic AI filler words like "thrilled," "passionate," "dynamic," "testament to," or "delve."
- **Cover Letter Structure**: Split cover letters into exactly three short paragraphs:
  - Paragraph 1: Why I am applying and my highest-level qualification.
  - Paragraph 2: Connect 2 specific metrics/projects/experience from my resume to the exact pain points mentioned in the job description.
  - Paragraph 3: A direct call to action for an interview.
- **Creativity / Temperature**: Set creativity/temperature to 1.5 to ensure natural sentence variation.
- **Tone and Energy (CRITICAL)**: Write with genuine, human enthusiasm and upbeat energy! Your tone should be highly engaging, confident, and conversational—like a passionate professional writing to a respected colleague. Do not sound dry, corporate, or overly formal. Inject natural excitement while remaining professional. Use varied sentence structures to ensure a natural, human rhythm.

# Infrastructure & Deployment Conventions
- **Auto Apply Worker**: Hosted on a DigitalOcean droplet accessible via `ssh root@167.99.55.186`.

