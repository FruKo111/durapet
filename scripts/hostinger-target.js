/**
 * Panel (web) ve API ayni repoda; Hostinger build/start ortaminda ayirt etmek icin.
 * Desteklenen env (ilk bulunan): DURAPET_BUILD, BUILD_TARGET, HB_PANEL
 */
function resolveTarget() {
  const raw =
    process.env.DURAPET_BUILD ||
    process.env.BUILD_TARGET ||
    process.env.HB_PANEL ||
    "";
  const v = String(raw).trim().toLowerCase();
  if (["web", "panel", "next", "1", "true", "yes"].includes(v)) return "web";
  return "api";
}

function rawTargetEnv() {
  return (
    process.env.DURAPET_BUILD ||
    process.env.BUILD_TARGET ||
    process.env.HB_PANEL ||
    ""
  );
}

module.exports = { resolveTarget, rawTargetEnv };
