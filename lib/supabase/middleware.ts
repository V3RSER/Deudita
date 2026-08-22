import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
            supabaseResponse = NextResponse.next({
              request,
            })
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    // IMPORTANT: Avoid writing any logic between createServerClient and
    // supabase.auth.getUser(). A simple mistake could make it very hard to debug
    // issues with users being randomly logged out.

    // Capture any invite token from search params into cookie
    const paramToken =
      request.nextUrl.searchParams.get('token') ??
      request.nextUrl.searchParams.get('invite') ??
      request.nextUrl.searchParams.get('group') ??
      request.nextUrl.searchParams.get('invite_token');

    if (paramToken) {
      supabaseResponse.cookies.set('deudita_invite_token', paramToken, {
        path: '/',
        maxAge: 86400 * 7,
        sameSite: 'lax',
      });
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (
      !user &&
      !request.nextUrl.pathname.startsWith('/login') &&
      !request.nextUrl.pathname.startsWith('/join') &&
      !request.nextUrl.pathname.startsWith('/api') &&
      !request.nextUrl.pathname.startsWith('/auth')
    ) {
      // no user, redirect to login
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }

    if (user && request.nextUrl.pathname.startsWith('/login')) {
      const activeToken = paramToken ?? request.cookies.get('deudita_invite_token')?.value;
      if (activeToken) {
        const url = request.nextUrl.clone()
        url.pathname = `/join/${activeToken}`
        url.search = ''
        return NextResponse.redirect(url)
      }

      // authenticated user without invite, redirect to dashboard/groups
      const url = request.nextUrl.clone()
      url.pathname = '/groups'
      return NextResponse.redirect(url)
    }
  } catch {
    return supabaseResponse
  }

  return supabaseResponse
}
