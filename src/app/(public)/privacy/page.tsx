import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div style={{ maxWidth: '800px', margin: '4rem auto', padding: '0 2rem', color: 'var(--text-primary)', lineHeight: 1.7 }}>
      <Link href="/" style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', fontWeight: 500 }}>
        ← Back to Home
      </Link>
      
      <div className="glass-card" style={{ padding: '3rem 2.5rem', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}><strong>Effective Date:</strong> July 18, 2026</p>
        
        <p>At <strong>Job Agent HQ</strong> ("Job Agent HQ," "we," "our," or "us"), we believe your job search is personal. We are committed to protecting your privacy and being transparent about how we collect, use, and safeguard your information.</p>
        <p>This Privacy Policy explains what information we collect, how we use it, and the choices you have regarding your data.</p>
        <p style={{ marginBottom: '2rem' }}>By using Job Agent HQ, you agree to the practices described in this Privacy Policy.</p>
        
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '2rem 0' }} />

        <h2 style={{ fontSize: '1.8rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 700 }}>Privacy at a Glance</h2>
        <p>Here's our commitment in plain English:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>We do <strong>not sell your personal information</strong>.</li>
          <li>We do <strong>not share your resumes, job searches, or application history with other users</strong>.</li>
          <li>We do <strong>not sell your data to advertisers or data brokers</strong>.</li>
          <li>Your custom job sources remain private to your account.</li>
          <li>Jobs imported from your email remain private to your account.</li>
          <li>You control your data and can request its deletion.</li>
        </ul>
        <p style={{ marginBottom: '2rem' }}>If you would like more detail, please continue reading.</p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '2rem 0' }} />

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>1. Information We Collect</h2>
        <p>To provide our services, we collect information you choose to provide, including:</p>
        
        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>Account Information</h3>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Name</li>
          <li>Email address</li>
          <li>Account credentials</li>
          <li>Subscription information</li>
        </ul>

        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>Professional Information</h3>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Resume</li>
          <li>Employment history</li>
          <li>Education</li>
          <li>Certifications</li>
          <li>Skills</li>
          <li>Work preferences</li>
          <li>Salary preferences</li>
          <li>Location preferences</li>
        </ul>

        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>AI Generated Content</h3>
        <p>The Service may generate: tailored resumes, cover letters, resume summaries, skills recommendations, job match analysis, and application responses. These documents are stored in your account so you can review and manage them.</p>

        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>Job Search Information</h3>
        <p>We may store: saved jobs, job scores, job application history, Kanban board status, application notes, and AI recommendations.</p>

        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>Custom Job Sources</h3>
        <p>If you create custom job scrapers or specify websites for monitoring, those sources are associated only with your account. They are <strong>not shared with other users</strong> or made publicly available.</p>

        <h3 style={{ fontSize: '1.2rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 600 }}>Email-Imported Jobs</h3>
        <p>If you authorize Job Agent HQ to import job opportunities from your email, those imported jobs remain private to your account. We do not use your email content to provide services to other users.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>2. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Provide the Job Agent HQ service</li>
          <li>Discover relevant jobs</li>
          <li>Generate tailored resumes and cover letters</li>
          <li>Score job opportunities and track applications</li>
          <li>Support Auto Apply</li>
          <li>Respond to support requests and secure the platform</li>
        </ul>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>3. Auto Apply</h2>
        <p>If you use Auto Apply, Job Agent HQ may visit employer websites, upload documents you have approved, complete forms you have authorized, and maintain activity logs. This activity is used solely to provide the requested service.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>4. Information We Do NOT Sell</h2>
        <p>We do not sell your resume, employment history, job searches, applications, email data, custom job sources, or contact details to advertisers or data brokers.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>5. Information We Do NOT Share</h2>
        <p>Your information remains private to your account. Other users cannot access your resumes, cover letters, saved jobs, email-imported jobs, or scraper configurations.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>6. AI and Your Data</h2>
        <p>We use artificial intelligence to help generate employment-related content. Your personal information is used only to generate content for your account. We do not intentionally publish or share your AI-generated documents with other users.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>7. Third-Party Services</h2>
        <p>We share information with third-party service providers (like payment processors and hosting services) only as necessary to perform functions on our behalf. Their use of your data is governed by their respective privacy policies.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>8. Data Security</h2>
        <p>We implement administrative, technical, and organizational safeguards designed to protect your information against unauthorized access, disclosure, or destruction. However, no internet transmission is 100% secure.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>9. Data Retention</h2>
        <p>We retain your information only as long as necessary to provide the Service, maintain your account, or comply with legal obligations. You may request account deletion at any time.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>10. Your Choices</h2>
        <p>You can update your account settings, delete saved resumes and documents, remove custom job sources, disable automation features, and request full deletion of your account at any time.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>11. Cookies and Analytics</h2>
        <p>We use cookies to keep you signed in, remember your preferences, and diagnose technical issues. You can manage cookies directly through your browser settings.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>12. Children's Privacy</h2>
        <p>Job Agent HQ is not intended for children under the age of 18. We do not knowingly collect personal information from children.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>13. International Users</h2>
        <p>If you access the Service from outside the United States, your information may be transferred to and processed in the United States.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>14. Changes to this Privacy Policy</h2>
        <p>We may update this Privacy Policy periodically. When material changes are made, we will update the Effective Date and notify you through the Service as appropriate.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>15. Contact Us</h2>
        <p>If you have questions about this Privacy Policy, please contact us at:</p>
        <p style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '0.5rem' }}>
          <strong>Job Agent HQ</strong><br />
          Email: <a href="mailto:privacy@jobagenthq.com" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>privacy@jobagenthq.com</a><br />
          Website: <a href="https://www.jobagenthq.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>https://www.jobagenthq.com</a>
        </p>
      </div>
    </div>
  );
}
