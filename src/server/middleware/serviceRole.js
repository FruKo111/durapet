const { serviceRoleVarMi } = require("../supabase");
const { hata } = require("../utils/http");

function serviceRoleGerekli(req, res, next) {
  if (!serviceRoleVarMi) {
    return hata(
      res,
      500,
      "SERVICE_ROLE_GEREKLI",
      "Bu islem icin SUPABASE_SERVICE_ROLE_KEY tanimli olmali.",
      null
    );
  }

  return next();
}

module.exports = {
  serviceRoleGerekli,
};

