'use client';

import dynamic from 'next/dynamic';
import { PresenceCursors } from './components/PresenceCursors';
import { AccessGate } from './components/AccessGate';

const InterviewPageClient = dynamic(() => import('./page-client'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent"></div>
        <p className="mt-4 text-gray-600">Loading interview platform...</p>
      </div>
    </div>
  ),
});

export default function Page() {
  return (
    <AccessGate>
      <InterviewPageClient />
      <PresenceCursors />
    </AccessGate>
  );
}
