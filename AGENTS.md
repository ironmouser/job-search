<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI Overlay Modal Conventions
- **Viewport Centering**: All overlay modals MUST be centered relative to the browser viewport (`position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 9999;`). Always use `createPortal(modalContent, document.body)` so modals attach to the root `document.body` and never get trapped in scrolled/transformed parent containers.
- **No Background Blur**: Overlay backdrops MUST NOT use `backdrop-filter: blur(...)` or `backdropFilter: 'blur(...)'`. Use a clean solid/semi-transparent background overlay (e.g. `rgba(0, 0, 0, 0.6)`).

