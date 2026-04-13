const { createClient } = require('@supabase/supabase-js')
const supabaseUrl = 'https://lpliytimpwstaiydwfwk.supabase.co'
const supabaseKey = 'sb_publishable__8vr69KZjUcdO13BlwgqVQ_1rm5b6OU'
const supabase = createClient(supabaseUrl, supabaseKey)
async function main() {
  const { data, error } = await supabase.auth.signUp({
    email: 'admin_test@dominos.com',
    password: 'password123'
  })
  if (error) console.log('ERROR:', error.message)
  else console.log('SUCCESS: User created', data.user.email)
}
main()
