import ErrorLayout from '@/components/ErrorLayout';

export default function NotFound() {
  return (
    <ErrorLayout
      statusCode={404}
      title="404 - Page Not Found"
      message="The page you are looking for does not exist, was renamed, or has been removed."
      showHomeButton={true}
    />
  );
}
