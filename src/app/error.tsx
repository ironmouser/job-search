"use client";

import { useEffect } from 'react';
import ErrorLayout from '@/components/ErrorLayout';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled runtime error:', error);
  }, [error]);

  return (
    <ErrorLayout
      statusCode={500}
      title="An Unexpected Error Occurred"
      message={error.message || 'Something went wrong while processing your request.'}
      onRetry={() => reset()}
      showHomeButton={true}
    />
  );
}
