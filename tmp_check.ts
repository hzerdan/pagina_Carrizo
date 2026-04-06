import { supabase } from './src/lib/supabase.ts'; 
async function check() { 
  const { data, error } = await supabase.from('v_pedidos_elegibles_inspeccion').select('*').limit(1); 
  console.log('Data:', data); 
  console.log('Error:', error); 
} 
check();
