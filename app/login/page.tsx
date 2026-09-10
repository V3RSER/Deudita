import { AuthView } from '@/components/login/AuthView';

export default async function LoginPage({
    searchParams,
}: Readonly<{
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}>) {
    const resolvedSearchParams = await searchParams;
    const error = typeof resolvedSearchParams.error === 'string' ? resolvedSearchParams.error : undefined;

    return <AuthView error={error} />;
}
