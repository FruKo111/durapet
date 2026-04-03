const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const serviceRoleVarMi = Boolean(serviceRoleKey);

if (!supabaseUrl) {
  throw new Error("SUPABASE_URL veya NEXT_PUBLIC_SUPABASE_URL tanimli degil.");
}

if (!anonKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY/PUBLISHABLE anahtari tanimli degil.");
}

if (!serviceRoleVarMi) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY tanimli degil. API guvenli calisma icin zorunludur.");
}

const supabaseAuth = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = {
  supabaseAuth,
  supabaseAdmin,
  serviceRoleVarMi,
};

