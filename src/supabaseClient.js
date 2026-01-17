import { createClient } from '@supabase/supabase-js'

// Load variables from .env file
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or Key. Make sure you have set .env variables.")
}

export const supabase = createClient(supabaseUrl, supabaseKey)