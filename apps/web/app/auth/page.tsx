import { redirect } from 'next/navigation';

// /auth redirects to /us/auth/connect — SIWE connect lives under /us
export default function AuthPage() {
  redirect('/us/auth/connect');
}
