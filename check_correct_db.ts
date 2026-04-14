
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const SUPABASE_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkSchema() {
  console.log(`Checking project: ${SUPABASE_URL}`);
  
  // Check tables presence
  const { data: tables, error: tableError } = await supabase
    .from('inspecciones')
    .select('*')
    .limit(1);
    
  if (tableError) {
    console.error('Error fetching inspecciones:', tableError);
  } else {
    console.log('Successfully connected to inspecciones. Sample:', tables);
  }

  // Get columns for inspecciones
  const { data: cols, error: colError } = await supabase.rpc('get_table_columns_v2', { p_table_name: 'inspecciones' });
  // If RPC doesn't exist, we might need another way or just trust the user request.
  if (colError) {
    console.log('RPC get_table_columns_v2 not found or failed.');
  } else {
    console.log('Columns in inspecciones:', cols);
  }
}

checkSchema();
