import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function HomeRedirect() {
  const router = useRouter();

  useEffect(() => {
    void router.replace('/map');
  }, [router]);

  return (
    <div className="h-full flex items-center justify-center text-sm text-gray-500">
      Redirecting…
    </div>
  );
}

