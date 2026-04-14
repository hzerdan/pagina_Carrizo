import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function check() {
  const { data: kanban } = await supabase.from('v_inspecciones_kanban').select('*').limit(1);
  console.log('Kanban columns:', kanban?.[0] ? Object.keys(kanban[0]) : 'no data');
  
  const { data: tpls } = await supabase.from('inspeccion_templates').select('*').limit(1);
  console.log('Templates columns:', tpls?.[0] ? Object.keys(tpls[0]) : 'no data');
  
  const { data: magic } = await supabase.from('magic_links').select('*').limit(1);
  console.log('Magic links columns:', magic?.[0] ? Object.keys(magic[0]) : 'no data');
}
check();
