import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = fs.readFileSync('.env', 'utf-8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

async function getViewDef() {
  const { data, error } = await supabase.rpc('execute_read_query', {
    query: "SELECT pg_get_viewdef('public.v_inspecciones_kanban', true) as def;"
  });
  if (error) console.error(error);
  console.log(JSON.stringify(data));
}
getViewDef();
