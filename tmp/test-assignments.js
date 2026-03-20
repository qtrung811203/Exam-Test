
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://gactvkovymctyvvvohaz.supabase.co'
const supabaseAnonKey = 'sb_publishable_mt6BFEca_oJbLBkbaF9Oxg_V1AReI_z'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  console.log('Fetching assignments sample...')
  const { data, error } = await supabase.from('assignments').select('*').limit(5)
  if (error) {
    console.error('Error:', error)
  } else {
    console.log('Assignments:', JSON.stringify(data, null, 2))
  }
}

test()
