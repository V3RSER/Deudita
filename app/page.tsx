import { redirect } from 'next/navigation';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const code = typeof params.code === 'string' ? params.code : undefined;
  const returnTo = typeof params.returnTo === 'string' ? params.returnTo : undefined;

  if (code) {
    const callbackUrl = returnTo
      ? `/auth/callback?code=${encodeURIComponent(code)}&returnTo=${encodeURIComponent(returnTo)}`
      : `/auth/callback?code=${encodeURIComponent(code)}`;
    redirect(callbackUrl);
  }

  redirect('/dashboard');
}
