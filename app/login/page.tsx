import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'تسجيل الدخول — ميزان' };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <AuthForm mode="login" />;
}
