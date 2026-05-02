// Host application must export its Supabase client from this module.
//
// Example:
//   import { createClient } from '@supabase/supabase-js'
//   export const supabase = createClient(
//     import.meta.env.VITE_SUPABASE_URL,
//     import.meta.env.VITE_SUPABASE_ANON_KEY
//   )
//
// Or, if your project already has a client elsewhere, just re-export:
//   export { supabase } from '@/lib/supabase'
//
// The hooks and lib/dm.js in this package import from this file path
// (./supabase-client). Do not rename it.

throw new Error(
  'extract/messaging/lib/supabase-client.js: host must provide a `supabase` export. ' +
  'Replace this file with `export { supabase } from "..."` before running the app.'
)
