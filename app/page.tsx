import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import ChatShell from '@/components/ChatShell';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return <ChatShell user={user} />;
}
