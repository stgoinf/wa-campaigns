const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function createUser() {
  const { data, error } = await supabase.auth.signUp({
    email: 'test@dominos.com',
    password: 'password123',
  })

  if (error) {
    console.error('Error:', error.message)
  } else {
    console.log('Usuario creado exitosamente:', data.user.email)
    console.log('NOTA: Si tienes activada la confirmación por correo, deberás confirmarlo en el panel de Supabase.')
  }
}

createUser()
