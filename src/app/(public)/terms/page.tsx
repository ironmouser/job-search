import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div style={{ maxWidth: '800px', margin: '4rem auto', padding: '0 2rem', color: 'var(--text-primary)', lineHeight: 1.7 }}>
      <Link href="/" style={{ color: 'var(--accent-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '2rem', fontWeight: 500 }}>
        ← Back to Home
      </Link>
      
      <div className="glass-card" style={{ padding: '3rem 2.5rem', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}>
        <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem', color: 'var(--text-primary)', fontWeight: 700 }}>Terms of Service</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}><strong>Effective Date:</strong> July 18, 2026</p>
        
        <p>Welcome to <strong>Job Agent HQ</strong> ("Job Agent HQ," "we," "our," or "us"). These Terms of Service ("Terms") govern your access to and use of the Job Agent HQ website, applications, and related services (collectively, the "Service").</p>
        <p style={{ marginBottom: '2rem' }}>By creating an account or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>
        
        <hr style={{ border: 'none', borderTop: '1px solid var(--border-glass)', margin: '2rem 0' }} />

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>1. Description of the Service</h2>
        <p>Job Agent HQ provides AI-powered tools designed to assist job seekers throughout the employment search process. Depending on your subscription and available features, the Service may:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Discover and aggregate publicly available job opportunities</li>
          <li>Score jobs based on your profile and preferences</li>
          <li>Generate AI-tailored resumes</li>
          <li>Generate AI-tailored cover letters</li>
          <li>Organize applications using a Kanban workflow</li>
          <li>Assist with or automate portions of online job applications</li>
          <li>Track application progress</li>
          <li>Provide AI-generated recommendations and insights</li>
        </ul>
        <p>The Service is intended to assist users but does not guarantee employment, interviews, recruiter responses, or job offers.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>2. Eligibility</h2>
        <p>You must be at least 18 years old (or the age of majority in your jurisdiction) to use the Service.</p>
        <p>You represent that all information you provide is accurate and that you are legally authorized to submit employment applications.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>3. User Accounts</h2>
        <p>You are responsible for:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Maintaining the confidentiality of your account credentials</li>
          <li>All activity occurring under your account</li>
          <li>Keeping your information accurate and current</li>
        </ul>
        <p>Notify us immediately if you believe your account has been compromised.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>4. Your Content</h2>
        <p>You retain ownership of all content you submit, including:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Resume information</li>
          <li>Employment history</li>
          <li>Cover letters</li>
          <li>Skills</li>
          <li>Certifications</li>
          <li>Uploaded documents</li>
          <li>Profile information</li>
        </ul>
        <p>By using the Service, you grant Job Agent HQ a limited license to process, store, modify, and transmit this information solely to provide the requested services.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>5. AI-Generated Content</h2>
        <p>The Service uses artificial intelligence to generate resumes, cover letters, summaries, application responses, and other employment-related content.</p>
        <p>AI-generated content:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>May contain inaccuracies</li>
          <li>May omit relevant information</li>
          <li>May misunderstand job descriptions</li>
          <li>Should be reviewed before use</li>
        </ul>
        <p>You are solely responsible for reviewing and approving all AI-generated content before it is submitted to an employer.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>6. Auto Apply Authorization</h2>
        <p>Certain subscription plans may include an Auto Apply feature.</p>
        <p>When you initiate or enable Auto Apply, you authorize Job Agent HQ to:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Visit third-party employment websites on your behalf</li>
          <li>Upload resumes and supporting documents you have approved</li>
          <li>Populate online application forms using information stored in your account</li>
          <li>Submit employment applications where supported</li>
          <li>Pause an application and request additional input when necessary</li>
        </ul>
        <p>You remain responsible for deciding which positions to pursue and for the accuracy of all submitted information.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>7. Human Review</h2>
        <p>Some applications require user participation.</p>
        <p>Examples include:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>CAPTCHA challenges</li>
          <li>Multi-factor authentication</li>
          <li>Identity verification</li>
          <li>Employer-specific questions</li>
          <li>Salary expectations</li>
          <li>Video interviews</li>
          <li>Employment assessments</li>
          <li>Unexpected application steps</li>
        </ul>
        <p>Job Agent HQ may pause an application and request your review before continuing.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>8. Third-Party Websites</h2>
        <p>The Service interacts with third-party job boards, employer career sites, and applicant tracking systems ("ATS").</p>
        <p>These third-party services are independent of Job Agent HQ.</p>
        <p>We do not control:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Their availability</li>
          <li>Their security practices</li>
          <li>Their application processes</li>
          <li>Their hiring decisions</li>
          <li>Changes to their websites</li>
        </ul>
        <p>Compatibility with third-party websites may change without notice.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>9. User Responsibilities</h2>
        <p>You agree that you will:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Provide truthful information</li>
          <li>Upload only documents you own or have permission to use</li>
          <li>Review AI-generated content</li>
          <li>Use the Service only for lawful employment purposes</li>
          <li>Comply with applicable laws</li>
        </ul>
        <p>You may not use the Service to:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Submit fraudulent applications</li>
          <li>Misrepresent your qualifications</li>
          <li>Apply using another person's identity</li>
          <li>Violate employer requirements</li>
          <li>Interfere with the operation of the Service</li>
        </ul>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>10. Employer Decisions</h2>
        <p>Job Agent HQ is not involved in hiring decisions.</p>
        <p>Employers determine whether to:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Review your application</li>
          <li>Schedule interviews</li>
          <li>Extend offers</li>
          <li>Reject candidates</li>
        </ul>
        <p>We make no guarantees regarding employment outcomes.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>11. No Guarantee of Results</h2>
        <p>While our AI is designed to improve the efficiency of your job search, we do not guarantee:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>Interviews</li>
          <li>Job offers</li>
          <li>Recruiter responses</li>
          <li>Salary levels</li>
          <li>Employment</li>
          <li>Faster hiring</li>
          <li>Successful application submission in every case</li>
        </ul>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>12. Automation Limitations</h2>
        <p>Automated application features may not function on every website.</p>
        <p>Automation may be limited by:</p>
        <ul style={{ paddingLeft: '1.5rem', margin: '1rem 0' }}>
          <li>CAPTCHA systems</li>
          <li>Security verification</li>
          <li>Website changes</li>
          <li>Unsupported applicant tracking systems</li>
          <li>Browser incompatibilities</li>
          <li>Required employer assessments</li>
          <li>Third-party outages</li>
        </ul>
        <p>Applications may require manual completion.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>13. Third-Party Terms</h2>
        <p>Many employer websites and job boards maintain their own Terms of Service.</p>
        <p>You acknowledge that your use of those websites remains subject to their applicable terms and policies.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>14. Intellectual Property</h2>
        <p>The Service, including software, branding, logos, designs, workflows, and AI systems, is owned by Job Agent HQ and protected by intellectual property laws.</p>
        <p>These Terms do not grant ownership of our software or technology.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>15. Subscription and Payments</h2>
        <p>Certain features require a paid subscription.</p>
        <p>Subscriptions automatically renew unless canceled before the renewal date.</p>
        <p>Fees are non-refundable except where required by law.</p>
        <p>We may modify pricing with advance notice.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>16. Service Availability</h2>
        <p>We strive to maintain reliable service but do not guarantee uninterrupted availability.</p>
        <p>We may update features, modify functionality, suspend maintenance, remove unsupported integrations, or improve AI models without prior notice.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>17. Privacy</h2>
        <p>Your use of the Service is also governed by our Privacy Policy, which explains how we collect, use, store, and protect your personal information.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>18. Disclaimer of Warranties</h2>
        <p style={{ fontStyle: 'italic' }}>The Service is provided "AS IS" and "AS AVAILABLE." To the fullest extent permitted by law, Job Agent HQ disclaims all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, accuracy, and non-infringement.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>19. Limitation of Liability</h2>
        <p>To the fullest extent permitted by law, Job Agent HQ shall not be liable for lost employment opportunities, hiring decisions, lost wages, lost profits, data loss, service interruptions, third-party website failures, employer actions, or indirect/consequential damages.</p>
        <p>Our total liability shall not exceed the amount you paid to us during the twelve (12) months preceding the event giving rise to the claim.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>20. Termination</h2>
        <p>You may stop using the Service at any time. We may suspend or terminate accounts that violate these Terms or misuse the Service.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>21. Changes to These Terms</h2>
        <p>We may update these Terms periodically. Material changes will be communicated through the Service or by email. Continued use of the Service after changes become effective constitutes acceptance of the revised Terms.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>22. Governing Law</h2>
        <p>These Terms are governed by the laws of the United States and the State in which Job Agent HQ is organized, without regard to conflict of law principles.</p>

        <h2 style={{ fontSize: '1.5rem', marginTop: '2rem', marginBottom: '1rem', color: 'var(--text-primary)', fontWeight: 600 }}>23. Contact Us</h2>
        <p>If you have questions regarding these Terms, please contact us at:</p>
        <p style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-glass)', marginTop: '0.5rem' }}>
          <strong>Job Agent HQ</strong><br />
          Email: <a href="mailto:support@jobagenthq.com" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>support@jobagenthq.com</a><br />
          Website: <a href="https://www.jobagenthq.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-primary)', textDecoration: 'none' }}>https://www.jobagenthq.com</a>
        </p>
      </div>
    </div>
  );
}
