import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// No Next 15 cookies() é assíncrono; mantemos createClient() síncrono e esperamos os cookies só quando o Supabase precisar deles.
export function createClient() {
  const cookieStore = cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('As variáveis NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou ANON_KEY) estão ausentes no ambiente.');
  }

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      async getAll() {
        return (await cookieStore).getAll()
      },
      async setAll(cookiesToSet) {
        try {
          const store = await cookieStore
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options))
        } catch {
          // Chamado de um Server Component: o middleware já renova a sessão, então pode ignorar.
        }
      },
    },
  })
}
