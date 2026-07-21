'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export default function FAQ() {
  const faqs = [
    { q: "Does AI write my resume?", a: "Yes, our AI tailors a custom version of your resume for every single job application to ensure maximum ATS compatibility." },
    { q: "Will employers know?", a: "No. The resumes and cover letters are generated in your own voice and formatted professionally using standard industry templates." },
    { q: "How does Auto Apply work?", a: "For supported job boards, our agent can navigate the application form and automatically fill in your details, resume, and answers to common screening questions." },
    { q: "Can I review applications first?", a: "Absolutely. You can set the agent to draft applications and wait for your manual approval before submitting." },
    { q: "Which job sites are supported?", a: "We currently support major platforms including LinkedIn, Indeed, Glassdoor, and standard Workday/Greenhouse/Lever portals." },
    { q: "Can I disable Auto Apply?", a: "Yes, you have full control over the automation settings and can pause or disable auto-apply at any time." }
  ];

  const [openIdx, setOpenIdx] = useState<number | null>(null);

  return (
    <section id="faq" style={{ padding: '6rem var(--section-px)' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
          <h2 style={{ fontSize: '2.5rem', color: 'var(--text-primary)', marginBottom: '1rem' }}>Frequently Asked Questions</h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {faqs.map((faq, idx) => (
            <div key={idx} className="glass-card" style={{ padding: '0', overflow: 'hidden', cursor: 'pointer' }} onClick={() => setOpenIdx(openIdx === idx ? null : idx)}>
              <div style={{ padding: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ fontSize: '1.1rem', color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{faq.q}</h4>
                <ChevronDown size={20} color="var(--text-secondary)" style={{ transform: openIdx === idx ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }} />
              </div>
              {openIdx === idx && (
                <div style={{ padding: '0 1.5rem 1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
