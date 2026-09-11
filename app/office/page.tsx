import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import OfficeClient from './OfficeClient';

export const dynamic = 'force-dynamic';

export default async function OfficePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return <OfficeClient />;
}
