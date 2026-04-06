import fs from 'fs';

const envFile = fs.readFileSync('.env', 'utf-8');
const SUPABASE_URL = envFile.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const SUPABASE_KEY = envFile.match(/VITE_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/v_pedidos_elegibles_inspeccion?select=*`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  const data = await res.json();
  
  // Dump a sample of matches directly
  const term = "325";
  const matches = data.filter(p => {
    const i = String(p.identificador || '').toLowerCase();
    const c = String(p.cliente || '').toLowerCase();
    const a = String(p.articulo || '').toLowerCase();
    if (i.includes(term) || c.includes(term) || a.includes(term)) {
      return true;
    }
    return false;
  });
  console.log("Total entries in view:", data.length);
  console.log("Matches for '325':", matches.length);
  console.log("Matches matching ident or cliente:", data.filter(p => String(p.identificador||'').toLowerCase().includes(term) || String(p.cliente||'').toLowerCase().includes(term)).length);
  const sample = data.find(p => String(p.identificador).includes("5260"));
  console.log("Sample 5260:", sample);
}

main();
