import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'إنشاء حساب — ميزان' };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/');
  return <AuthForm mode="register" />;
}
