// Bootstraps an admin (spec section 6): creates a confirmed email/password user with the
// admin role. Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run create-admin -- <email> <password> <displayName>
import { createClient } from '@supabase/supabase-js'

async function main(): Promise<void> {
  const [email, password, displayName] = process.argv.slice(2)
  const url = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!email || !password || !displayName || !url || !serviceRoleKey) {
    console.error(
      'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run create-admin -- <email> <password> <displayName>',
    )
    process.exit(1)
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
    app_metadata: { role: 'admin' },
  })
  if (error) throw new Error(`Could not create the user: ${error.message}`)

  // GoTrue stores app metadata after the insert the profile trigger sees, so set the role
  // on the profile directly as well.
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', data.user.id)
  if (profileError) {
    await supabase.auth.admin.deleteUser(data.user.id)
    throw new Error(`Could not set the admin role: ${profileError.message}`)
  }

  console.log(`Admin created: ${email} (${data.user.id})`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
