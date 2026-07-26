"use client";

import ErrorLayout from '@/components/ErrorLayout';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <ErrorLayout
          statusCode={500}
          title="Application Error"
          message={error.message || 'A critical error occurred in the application.'}
          onRetry={() => reset()}
          showHomeButton={true}
        />
      </body>
    </html>
  );
}
