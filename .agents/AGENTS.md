# Content Writing Rules

- When writing or rewriting content for resumes, cover letters, networking messages, or Q&A, do not use em dashes (—) and other telltale signs that the content was written by AI.
- Avoid formulaic and overly ambitious adverbs or clichés like "directly aligns with", "gives me a direct line into everything this role requires", or "taking on one of the hardest parts of". Use grounded, natural phrasing (e.g. "aligns with my background in...", "fits my experience in...", "mirrors my work in..."). Keep the tone natural and human.
- In cover letters, make Paragraph 1 direct and crisp (2-3 sentences max) stating the exact role, company, and your highest-level qualification without rhetorical scenarios or storybook preambles.
- In Paragraph 2, avoid merely reciting resume bullet points ("At Company A I did X, and at Company B I did Y"). Instead, focus on *why* what you did was important and *how* it benefited the business and/or users (e.g. eliminating bottlenecks, reducing friction, accelerating adoption), tying those proven results directly to the role.

# Infrastructure & Deployment

- **Production Server & Services**: The Next.js web app, database, and background auto-apply worker are all hosted as services on **Railway**.
- **Database**: PostgreSQL via Prisma on Railway (`tokaido.proxy.rlwy.net`). Use the Railway dashboard or Railway CLI (`railway logs` / `railway run`) for production queries and logs.
- **Auto Apply Worker**: The background auto-apply worker is hosted as a dedicated Railway service.

# Engineering Integrity & Implementation Standards

- **No Unannounced Simulations or Stubs**: NEVER present simulated solutions, mock tokens, stubs, or fake verifications without explicitly highlighting them as simulated, stubs, or placeholders.
- **Explicit Permission Required**: NEVER include simulated, stubbed, or mock solutions in implementation plans or proposed architectures without first asking the user for permission and receiving explicit approval. Real, functioning implementations must always be the default standard.

