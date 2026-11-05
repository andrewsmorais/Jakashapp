# Apple Sign In Setup Guide

## Overview
This guide covers the complete setup of Apple Sign In (Sign in with Apple) for the Jakash SaaS platform using Supabase authentication.

## Prerequisites Completed ✅
- ✅ Apple Developer Account created
- ✅ App ID created: `com.jakash.app`
- ✅ Service ID created: `com.jakash.app.web` for web OAuth
- ✅ Private Key generated with Key ID: `8BNJR248TZ`
- ✅ Apple Sign In enabled in Supabase Dashboard
- ✅ JWT generated and configured in Supabase

## Technical Details

### Credentials (from Apple Developer)
- **Team ID**: `3V989HNC76`
- **Service ID**: `com.jakash.app.web`
- **Key ID**: `8BNJR248TZ`
- **Private Key**: Generated and secured in Supabase

### Supabase Configuration
All credentials are configured in: **Project Settings → Authentication → Providers → Apple**
- Client IDs: `com.jakash.app.web`
- Secret Key: JWT (valid for 6 months, regenerate with the provided Node.js script)
- Status: **ENABLED** ✅

### Callback URLs
The Supabase-provided Callback URL is:
```
https://sogeaffujqmrrzuhrtao.supabase.co/auth/v1/callback
```

This URL is already configured in the Supabase provider settings.

## Testing Locally

### Step 1: Start Development Server
```bash
npm run dev
```
Access the app at `http://localhost:3000`

### Step 2: Test Apple Sign In
1. Go to `http://localhost:3000/login` or `http://localhost:3000/cadastro`
2. Click the **"Continuar com Apple"** button
3. You'll be redirected to Apple's OAuth flow
4. Sign in with your Apple ID
5. You should be redirected back to the app after authentication

### Step 3: Verify User Creation
After successful sign-in:
1. Check Supabase Dashboard → **Authentication → Users**
2. New user should be listed with Apple as the provider
3. Check **Database → profiles table** - user profile should be auto-created via the trigger

## Deployment to Vercel

### Step 1: Deploy
```bash
git add .
git commit -m "feat: Apple Sign In implementation"
git push origin main
```

Vercel will automatically deploy from the main branch.

### Step 2: Update Redirect URL in Apple Developer (if needed)

If you have a custom domain:
1. Go to Apple Developer → Identifiers → Services IDs → com.jakash.app.web
2. Click "Edit"
3. Under "Sign In with Apple Configuration", add your production Redirect URLs:
   - Production: `https://your-domain.com/auth/callback`
   - Or: `https://jakash.vercel.app/auth/callback`

**Note**: The default Supabase callback URL already works, so this step is optional unless you're using a custom domain.

### Step 3: Update Environment Variables (if needed)

In your Vercel dashboard, ensure environment variables are set:
- `NEXT_PUBLIC_SUPABASE_URL` ✅
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` ✅

These should already be configured.

## Testing Providers Simultaneously

Both Google and Apple Sign In are now enabled:

**Login Page** (`/login`):
- Email/Password form
- "Continuar com Google" button
- "Continuar com Apple" button

**Signup Page** (`/cadastro`):
- Name, Email, Password form
- "Continuar com Google" button
- "Continuar com Apple" button

Users can choose either OAuth provider or create an account with email/password.

## Key Implementation Details

### Auto-Profile Creation
When a user signs in with Apple (or Google) for the first time:
1. Supabase creates the user in the `auth.users` table
2. The `on_auth_user_created` trigger automatically:
   - Creates a row in the `public.profiles` table
   - Sets `display_name` from the auth user's full_name
   - Initializes `created_at` and `updated_at` timestamps

This happens in the migration: `supabase/migrations/20261015120000_oauth_profile_trigger.sql`

### OAuth Flow Details
1. User clicks "Continuar com Apple"
2. App calls `signInWithOAuth({ provider: "apple", options: { redirectTo } })`
3. Supabase redirects to Apple's login
4. User authenticates with Apple ID
5. Apple redirects back to: `{redirectTo}?code=...&state=...`
6. `/auth/callback` route handles the exchange with `exchangeCodeForSession()`
7. Session is created and user is authenticated
8. Redirects to appropriate page (dashboard for signup, next parameter for login)

## Troubleshooting

### JWT Expired (after 6 months)
If users can't sign in with Apple after 6 months:
1. Regenerate the JWT using the Node.js script:
   ```bash
   node generate-apple-jwt.js
   ```
2. Update the Secret Key in Supabase Provider settings
3. No code changes needed

### Sign In Fails with "Invalid Client"
- Verify Service ID is correct: `com.jakash.app.web`
- Check JWT is properly formatted (starts with header.payload.signature)
- Ensure JWT hasn't expired

### User Not Created in Database
- Check database trigger is active: `on_auth_user_created`
- Verify profiles table exists
- Check trigger logs in Supabase

### PKCE Flow Issues
The callback route handles PKCE automatically. If issues occur:
- Verify `auth/callback` route exists at `/src/app/auth/callback/route.ts`
- Check error logs in browser console
- Review Supabase Auth logs in dashboard

## Security Considerations

✅ Private Key stored only in Supabase (never in code)
✅ JWT generated with secure ES256 algorithm
✅ Callback URL validates domain/origin
✅ PKCE flow prevents authorization code interception
✅ Session tokens secured via httpOnly cookies

## Related Files

- **Login Page**: `/src/app/login/page.tsx`
- **Signup Page**: `/src/app/cadastro/page.tsx`
- **Callback Handler**: `/src/app/auth/callback/route.ts`
- **Auth Components**: `/src/components/auth/AuthShell.tsx`
- **Auth Utilities**: `/src/lib/authUtil.ts`
- **Supabase Client**: `/src/lib/supabase/client.ts`
- **Database Trigger**: `/supabase/migrations/20261015120000_oauth_profile_trigger.sql`

## Next Steps

1. ✅ Test Apple Sign In locally
2. ✅ Deploy to Vercel
3. ✅ Test sign-in flow in production
4. ✅ Monitor user signups/signins in Supabase Dashboard
5. ✅ Set up JWT regeneration reminder for 6 months from now

## Support & Documentation

- [Supabase Apple Sign In Docs](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Apple Sign In Official Docs](https://developer.apple.com/sign-in-with-apple/)
- [OAuth 2.0 PKCE](https://datatracker.ietf.org/doc/html/rfc7636)
