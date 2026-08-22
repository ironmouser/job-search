---
name: ats-application-automation
description: Expert guide and battle-tested strategies for automating job application form-filling across ATS platforms (Greenhouse, Lever, Workday, Ashby, SmartRecruiters, iCIMS, Taleo). Use when writing, debugging, or extending ATS plugins, browser auto-apply workers, input field mapping, and anti-obstruction handlers.
---

# ATS Application Automation & Form-Filling Guide

This skill provides comprehensive architecture guidelines, selector heuristics, platform-specific edge-case solutions, and anti-bot mitigation for the auto-apply worker (`worker/src/plugins/*`).

---

## 1. Autonomous State-Machine Architecture

Never write linear, rigid "step 1 -> step 2 -> step 3" scripts. Real-world ATS workflows vary by company configuration. All plugins must implement an **Autonomous State Machine**:

```
           ┌────────────────────────────────────────┐
           ▼                                        │
    [Inspect Current View]                          │
           │                                        │
           ├─► Cookie / Obstruction Modal? ──► [Dismiss Modal]
           ├─► Login / Account Creation?   ──► [Handle Auth / Session]
           ├─► Resume / File Upload Step?  ──► [Upload & Await Parser]
           ├─► Form Fields / Screening Qs? ──► [Fill & Trigger Events]
           ├─► EEOC / Diversity Disclosures──► [Apply Safe Defaults]
           ├─► Review Page / Verification? ──► [Visual Glow & Stage]
           └─► Success / Confirmation?     ──► [Record Application & Exit]
           │
    [Validate Inline Errors]
           │
    [Advance to Next Step] ─────────────────────────┘
```

---

## 2. Platform-Specific Playbooks & Edge Cases

### A. Workday (`worker/src/plugins/workday.ts`)
* **Dependent Dropdown Cascades (Country $\rightarrow$ State)**:
  * *Trap*: Selecting "Country" fires an asynchronous background XHR that destroys and re-renders State, City, and Postal Code fields. Filling address before this XHR completes wipes out the data.
  * *Rule*: Enforce **Top-Down Sequential Filling**. Select Country $\rightarrow$ wait for dependent spinner / networkidle $\rightarrow$ Select State/Region $\rightarrow$ Fill Postal Code.
* **Custom Dropdown Listboxes**:
  * Workday uses `div[data-automation-id="formLabel"]` coupled with `div[role="combobox"]` or `button[aria-haspopup="listbox"]`.
  * *Interaction Sequence*: Click combobox $\rightarrow$ wait for `div[role="listbox"]` $\rightarrow$ type query with delay $\rightarrow$ wait 300ms $\rightarrow$ click target `li[role="option"]`.
* **Login Redirect Loop Defense**:
  * Check whether the URL contains `/login` or `/create-account`. If authentication is required, retrieve cached credentials from `SessionVault` or fall back to guest application if present.

### B. Greenhouse (`worker/src/plugins/greenhouse.ts`)
* **Hidden File Input Uploads**:
  * *Never* call `page.click('input[type="file"]')` (will throw if hidden/zero-opacity).
  * *Pattern*: `await page.locator('input[type="file"]').first().setInputFiles(resumePdfPath);`
* **Custom React/Select2 Comboboxes**:
  * Click the visible `.select2-choice` or `[class*="-control"]` container, type search text, and click `.select2-result-label` or `[id*="-option-"]`.
* **Multi-Step vs Single-Page Transitions**:
  * After clicking Submit, verify whether the page displays a confirmation message or navigates to a second "Additional Questions" page before declaring completion.

### C. Lever (`worker/src/plugins/lever.ts`)
* **Scoped Question Containers**:
  * Lever groups each question inside `li.application-question`. Locate questions and inputs relative to the container element rather than globally across the DOM.
* **Radio Groups & Checkboxes**:
  * Click the corresponding `<label>` element containing the desired text option to trigger Lever's custom SVG check state.

### D. Ashby (`worker/src/plugins/ashby.ts`)
* **Shadow DOM & Nested Iframes**:
  * Ashby frequently renders application widgets inside shadow roots or embedded iframes. Playwright's `getByRole` and `getByLabel` locators automatically pierce open shadow roots; for iframe embeds, use `page.frameLocator('iframe[src*="ashby"]')`.

### E. SmartRecruiters (`worker/src/plugins/smartrecruiters.ts`)
* **Resume Parser Race Condition Prevention**:
  * *Trap*: SmartRecruiters initiates an asynchronous OCR parse (3–8s) upon resume upload that overwrites input fields.
  * *Rule*: Upload the resume **first**, wait for the parser status badge/spinner to disappear, and **then** inspect, fill, and correct the form fields.

### F. iCIMS & Taleo (`worker/src/plugins/icims.ts`, `worker/src/plugins/taleo.ts`)
* **Multi-Layered Frame Scoping**:
  * iCIMS forms live inside nested frames (e.g. `iframe#icims_content_iframe`). Chain `frameLocator` calls:
    ```typescript
    const formFrame = page.frameLocator('iframe#icims_content_iframe');
    await formFrame.getByLabel(/First Name/i).fill(profile.firstName);
    ```
* **Rich-Text Cover Letter Editors**:
  * For `contenteditable` divs or embedded CKEditor/TinyMCE iframes, click the editable body and type using `pressSequentially`.

---

## 3. Robust Field Detection & Synthetic Event Triggering

### A. Four-Tier Selector Cascade
1. **Semantic HTML & Standard Autocomplete**:
   * `input[name="firstName"]`, `input[name="first_name"]`, `input[autocomplete="given-name"]`
   * `input[name="email"]`, `input[type="email"]`, `input[autocomplete="email"]`
   * `input[name="phone"]`, `input[type="tel"]`, `input[autocomplete="tel"]`
2. **Accessible Labels**:
   * `page.getByLabel(/First Name/i)`
   * `page.locator('label:has-text("Email") + input, label:has-text("Email") ~ div input')`
3. **ARIA & Descriptive Placeholders**:
   * `input[aria-label*="First Name" i]`, `input[placeholder*="First Name" i]`
4. **Question Resolver & AI Fallback**:
   * Normalized question text matching for custom screening items.

### B. Committing Synthetic Events in Modern Frameworks (React, Angular, Vue)
* Directly setting `input.value = ...` in JavaScript bypasses React/Vue event listeners, causing "Field is required" errors on submit.
* Always use Playwright's `locator.fill()` (which automatically emits `input` and `change` events).
* For masked inputs (phone numbers, currency, dates), send `pressSequentially` followed by `press('Tab')` or `dispatchEvent('blur')` to force the framework to validate and commit state.

---

## 4. Screening Questions & EEOC Safety Defaults

* **Work Authorization**:
  * "Are you authorized to work in the US?" $\rightarrow$ Default **Yes** (if profile authorized).
  * "Do you now or in the future require visa sponsorship?" $\rightarrow$ Default **No** (unless user explicitly requires sponsorship).
* **Voluntary Self-Identification (EEOC)**:
  * Gender: Select *"I do not wish to self-identify"* / *"Decline to state"* / *"Prefer not to say"*.
  * Race / Ethnicity: Select *"Decline to self-identify"* / *"Two or More Races"* / *"Prefer not to disclose"*.
  * Veteran Status: Select *"I am not a protected veteran"* or *"I do not wish to self-identify"*.
  * Disability: Select *"I do not wish to answer"* or *"No, I do not have a disability"*.

---

## 5. Anti-Bot & Obstruction Handling

* **Cookie Consent Overlays**:
  * Check and dismiss known cookie IDs (`#onetrust-accept-btn-handler`, `button[id*="cookie"]`, `button:has-text("Accept All")`) before starting form filling.
* **Human-like Cadence**:
  * Add randomized micro-delays (20–60ms per keystroke) when entering long-form text.
* **Dynamic Network Synchronization**:
  * Replace static `waitForTimeout()` calls with explicit event-driven waiters (`waitForLoadState('networkidle')`, `locator.waitFor({ state: 'visible' })`).
