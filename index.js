const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const crypto = require("crypto");
const { Pool } = require("pg");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json({ limit: "5mb" }));
app.use(morgan("combined"));

const PORT = parseInt(process.env.PORT || "3000", 10);
const DATABASE_URL = process.env.DATABASE_URL || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const API_TOKEN = process.env.API_TOKEN || "";

if (!DATABASE_URL) {
  console.warn("DATABASE_URL no configurada.");
}
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn("SUPABASE_URL o SUPABASE_ANON_KEY no configurados.");
}

const allowOriginsEnv = (process.env.ALLOW_ORIGINS || "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors(
  allowOriginsEnv.length
    ? {
        origin: (origin, cb) => {
          if (!origin) return cb(null, true);
          if (allowOriginsEnv.includes(origin)) return cb(null, true);
          return cb(new Error("CORS origin denied"));
        }
      }
    : { origin: true }
));

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;

function supabaseForRequest(req) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: req.headers.authorization || ""
      }
    }
  });
}

async function requireSupabaseUser(req, res, next) {
  try {
    const authHeader = (req.headers.authorization || "").trim();
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return res.status(401).json({ ok: false, error: "Falta token de acceso" });
    }

    const supabase = supabaseForRequest(req);
    const { data, error } = await supabase.auth.getUser();
    if (error || !data || !data.user) {
      return res.status(401).json({ ok: false, error: "Token inválido o expirado" });
    }

    req.supabaseUser = data.user;
    next();
  } catch (err) {
    console.error("requireSupabaseUser error:", err);
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
}

async function requireAdmin(req, res, next) {
  if (!API_TOKEN) return next();
  const authHeader = (req.headers.authorization || "").trim();
  const bodyToken = (req.body && req.body._token) ? String(req.body._token).trim() : "";
  const tokenQuery = (req.query.token || "").trim();

  const candidates = [];
  if (authHeader.toLowerCase().startsWith("bearer ")) candidates.push(authHeader.slice(7).trim());
  if (bodyToken) candidates.push(bodyToken);
  if (tokenQuery) candidates.push(tokenQuery);

  if (candidates.includes(API_TOKEN)) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

async function getAppUserBySupabaseId(uid) {
  const { rows } = await pool.query(
    `SELECT supabase_user_id, email, full_name, hospital_clave, hospital_nombre, role, active
     FROM app_users
     WHERE supabase_user_id = $1
     LIMIT 1`,
    [uid]
  );
  return rows[0] || null;
}

async function ensureUserHasHospital(req, res) {
  const user = await getAppUserBySupabaseId(req.supabaseUser.id);
  if (!user) {
    res.status(403).json({ ok: false, error: "Usuario sin hospital asignado" });
    return null;
  }
  if (!user.active) {
    res.status(403).json({ ok: false, error: "Usuario inactivo" });
    return null;
  }
  return user;
}

const HOSPITALES = [
  { nombre: "Centro de Alta Especialidad DR.Rafael Lucio", clave: "VZIM002330" },
  { nombre: "Centro de Salud con Hospitalizacion de Alto Lucero de Gutierrez Barrios,Ver.", clave: "VZIM008065" },
  { nombre: "Centro De Salud con Hospitalizacion de la localidad de Allende, Ver.", clave: "VZIM007942" },
  { nombre: "Centro Estatal de Cancerologia Dr.Miguel Dorantes Mesa", clave: "VZIM002325" },
  { nombre: "Hospital Comunitario de Ixhuatlan del Sureste", clave: "VZIM002120" },
  { nombre: "Hospital Comunitario de Tonalapan", clave: "VZIM006122" },
  { nombre: "Hospital de Alta Especialidad de Veracruz", clave: "VZIM005533" },
  { nombre: "Hospital de la Comunidad Catemaco", clave: "VZIM000691" },
  { nombre: "Hospital de la Comunidad de Coatepec", clave: "VZIM000790" },
  { nombre: "Hospital de la Comunidad de Alvarado", clave: "VZIM000254" },
  { nombre: "Hospital de la Comunidad de Cerro Azul", clave: "VZIM006180" },
  { nombre: "Hospital de la Comunidad de Entabladero", clave: "VZIM006163" },
  { nombre: "Hospital de la Comunidad de Gutierrez Zamora", clave: "VZIM001794" },
  { nombre: "Hospital de la Comunidad de Huayacocotla", clave: "VZIM001922" },
  { nombre: "Hospital de la Comunidad de Jose Azueta", clave: "VZIM007860" },
  { nombre: "Hospital de la Comunidad de Llano de en medio", clave: "VZIM006151" },
  { nombre: "Hospital de la Comunidad de Naolinco", clave: "VZIM007732" },
  { nombre: "Hospital de la Comunidad de Tempoal", clave: "VZIM004710" },
  { nombre: "Hospital de la Comunidad de Teocelo", clave: "VZIM004775" },
  { nombre: "Hospital de la Comunidad de Tezonapa", clave: "VZIM006146" },
  { nombre: "Hospital de la Comunidad de Tlaquilpan Vista Hermosa", clave: "VZIM006134" },
  { nombre: "Hospital de la Comunidad Dr.Pedro Coronel Perez", clave: "VZIM015425" },
  { nombre: "Hospital de la Comunidad La Laguna Poblado 6", clave: "VZIM007573" },
  { nombre: "Hospital de la Comunidad Naranjos", clave: "VZIM000416" },
  { nombre: "Hospital de la Comunidad Ozuluama de Mascareñas", clave: "VZIM004085" },
  { nombre: "Hospital de la Comunidad Playa Vicente", clave: "VZIM004674" },
  { nombre: "Hospital de la Comunidad Suchilapan del Rio Carmen Bouzas de Lopez Arias", clave: "VZIM002511" },
  { nombre: "Hospital de la Comunidad Tlacotalpan", clave: "VZIM005171" },
  { nombre: "Hospital de la Comunidad Tlapacoyan", clave: "VZIM005306" },
  { nombre: "Hospital de Salud Mental Orizaba Dr. Victor M. Concha Vasquez", clave: "VZIM004032" },
  { nombre: "Hospital General Alamo", clave: "VZIM016035" },
  { nombre: "Hospital General Altotonga Eufrosina Camacho", clave: "VZIM000230" },
  { nombre: "Hospital General Cordoba Yanga", clave: "VZIM000983" },
  { nombre: "Hospital General Cosamaloapan Dr.Victor Manuel Pitalua Gonzales", clave: "VZIM001000" },
  { nombre: "Hospital General de Cosoloacaque", clave: "VZIM007930" },
  { nombre: "Hospital General de Boca del Rio", clave: "VZIM010212" },
  { nombre: "Hospital General de Cardel", clave: "VZIM006105" },
  { nombre: "Hospital General de Minatitlan", clave: "VZIM003595" },
  { nombre: "Hospital General de Misantla", clave: "VZIM003740" },
  { nombre: "Hospital General de Otula-Acayucan", clave: "VZIM007882" },
  { nombre: "Hospital General de Santiago Tuxtla", clave: "VZIM004046" },
  { nombre: "Hospital General de Tarimoya (Veracruz)", clave: "VZIM006175" },
  { nombre: "Hospital General Tierra Blanca Jesus Garcia Corona", clave: "VZIM004944" },
  { nombre: "Hospital General Huatusco Dr.Dario Mendez Lima", clave: "VZIM002393" },
  { nombre: "Hospital General Isla", clave: "VZIM015411" },
  { nombre: "Hospital General Martinez de la Torre", clave: "VZIM003361" },
  { nombre: "Hospital General Panuco Dr.Manuel I.Avila", clave: "VZIM004160" },
  { nombre: "Hospital General Papantla Dr.Jose Buill Belenguer", clave: "VZIM004370" },
  { nombre: "Hospital General Perote Veracruz", clave: "VZIM004580" },
  { nombre: "Hospital General San Andres Tuxtla Dr.Bernardo Peña", clave: "VZIM004913" },
  { nombre: "Hospital General Tantoyuca", clave: "VZIM005560" },
  { nombre: "Hospital General Tlalixcoyan", clave: "VZIM007754" },
  { nombre: "Hospital General Tuxpan Dr.Emilio Alcazar", clave: "VZIM005393" },
  { nombre: "Hospital Regional de Coatzacoalcos Dr.Valentin Gomez Farias", clave: "VZIM000826" },
  { nombre: "Hospital Regional de Xalapa Dr.Luis F.Nachon", clave: "VZIM002342" },
  { nombre: "Hospital Regional Poza Rica de Hidalgo", clave: "VZIM003766" },
  { nombre: "Hospital Regional Rio Blanco", clave: "VZIM003870" },
  { nombre: "Instituto Veracruzano de Salud Mental Dr.Rafael Velasco Fernandez", clave: "VZIM002982" },
  { nombre: "Uneme de Platon Sanchez", clave: "VZIM015545" }
];

app.get("/health", (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), usingDb: true });
});

app.get("/hospitales", (req, res) => {
  const q = (req.query.q || "").trim().toLowerCase();
  if (!q) return res.json(HOSPITALES);
  const filtered = HOSPITALES.filter(h =>
    (h.nombre || "").toLowerCase().includes(q) || (h.clave || "").toLowerCase().includes(q)
  );
  return res.json(filtered);
});

app.get("/me", requireSupabaseUser, async (req, res) => {
  try {
    const appUser = await getAppUserBySupabaseId(req.supabaseUser.id);
    if (!appUser) {
      return res.status(403).json({
        ok: false,
        error: "Usuario autenticado pero sin hospital asignado"
      });
    }
    return res.json({
      ok: true,
      user: {
        id: req.supabaseUser.id,
        email: req.supabaseUser.email || appUser.email || "",
        hospital_clave: appUser.hospital_clave,
        hospital_nombre: appUser.hospital_nombre,
        full_name: appUser.full_name || "",
        role: appUser.role || "encargado"
      }
    });
  } catch (e) {
    console.error("Error /me:", e);
    return res.status(500).json({ ok: false, error: "error obteniendo perfil" });
  }
});

app.post("/admin/invite-user", requireAdmin, async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(500).json({ ok: false, error: "Supabase admin no configurado" });
    }

    const { email, full_name, hospital_clave, hospital_nombre, role } = req.body || {};
    if (!email || !hospital_clave || !hospital_nombre) {
      return res.status(400).json({ ok: false, error: "faltan email, hospital_clave o hospital_nombre" });
    }

    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: full_name || "",
        hospital_clave,
        hospital_nombre,
        role: role || "encargado"
      }
    });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    const userId = data && data.user && data.user.id ? data.user.id : null;
    if (!userId) {
      return res.status(500).json({ ok: false, error: "No se recibió el id del usuario invitado" });
    }

    await pool.query(
      `INSERT INTO app_users (supabase_user_id, email, full_name, hospital_clave, hospital_nombre, role, active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       ON CONFLICT (supabase_user_id)
       DO UPDATE SET email = EXCLUDED.email,
                     full_name = EXCLUDED.full_name,
                     hospital_clave = EXCLUDED.hospital_clave,
                     hospital_nombre = EXCLUDED.hospital_nombre,
                     role = EXCLUDED.role,
                     active = TRUE`,
      [userId, email, full_name || "", hospital_clave, hospital_nombre, role || "encargado"]
    );

    return res.json({ ok: true, userId });
  } catch (e) {
    console.error("Error invitando usuario:", e);
    return res.status(500).json({ ok: false, error: "error invitando usuario" });
  }
});

app.get("/inventory-base", requireSupabaseUser, async (req, res) => {
  try {
    const appUser = await ensureUserHasHospital(req, res);
    if (!appUser) return;

    const categoria = (req.query.categoria || "").trim();
    if (!categoria) return res.json([]);

    const { rows } = await pool.query(
      `SELECT clave, descripcion, stock, minimo, fecha, dias_restantes, categoria
       FROM inventarios_csv
       WHERE hospital_clave = $1 AND categoria = $2
       ORDER BY descripcion ASC`,
      [appUser.hospital_clave, categoria]
    );
    return res.json(rows || []);
  } catch (e) {
    console.error("Error GET /inventory-base:", e);
    return res.status(500).json({ ok: false, error: "Error interno del servidor" });
  }
});

app.get("/inventory", requireSupabaseUser, async (req, res) => {
  try {
    const appUser = await ensureUserHasHospital(req, res);
    if (!appUser) return;

    const categoria = (req.query.categoria || "").trim();
    if (!categoria) return res.json([]);

    const { rows } = await pool.query(
      `SELECT id, hospital_clave, hospital_nombre, categoria, items, saved_at
       FROM inventarios
       WHERE hospital_clave = $1 AND categoria = $2
       ORDER BY id DESC
       LIMIT 1`,
      [appUser.hospital_clave, categoria]
    );

    return res.json(rows[0] || {});
  } catch (e) {
    console.error("Error GET /inventory:", e);
    return res.status(500).json({ ok: false, error: "error leyendo inventory" });
  }
});

app.post("/inventory", requireSupabaseUser, async (req, res) => {
  try {
    const appUser = await ensureUserHasHospital(req, res);
    if (!appUser) return;

    const { categoria, items } = req.body || {};
    if (!categoria || !Array.isArray(items)) {
      return res.status(400).json({ ok: false, error: "falta categoria o items" });
    }

    const itemsWithUid = items.map(it => {
      if (it && it.uid) return it;
      const uid = crypto.randomUUID ? crypto.randomUUID() : `uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      return { ...it, uid };
    });

    const payload = {
      hospital_clave: appUser.hospital_clave,
      hospital_nombre: appUser.hospital_nombre,
      categoria,
      items: itemsWithUid
    };

    await pool.query(
      `INSERT INTO inventarios (hospital_clave, hospital_nombre, categoria, items, saved_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())`,
      [payload.hospital_clave, payload.hospital_nombre, payload.categoria, JSON.stringify(payload.items)]
    );

    return res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (e) {
    console.error("Error POST /inventory:", e);
    return res.status(500).json({ ok: false, error: "error guardando inventory" });
  }
});

app.post("/inventory/item/delete", requireSupabaseUser, async (req, res) => {
  try {
    const appUser = await ensureUserHasHospital(req, res);
    if (!appUser) return;

    const { categoria, uids } = req.body || {};
    if (!categoria || !Array.isArray(uids) || uids.length === 0) {
      return res.status(400).json({ ok: false, error: "falta categoria o uids" });
    }

    const { rows } = await pool.query(
      `SELECT id, items
       FROM inventarios
       WHERE hospital_clave = $1 AND categoria = $2
       ORDER BY id DESC
       LIMIT 1`,
      [appUser.hospital_clave, categoria]
    );
    if (!rows.length) {
      return res.status(404).json({ ok: false, error: "no inventory found" });
    }

    let items = rows[0].items;
    if (!Array.isArray(items)) {
      try { items = JSON.parse(items); } catch (_) { items = []; }
    }

    const setUids = new Set(uids.map(String));
    const filtered = items.filter(it => !setUids.has(String(it && it.uid)));

    await pool.query(
      `UPDATE inventarios SET items = $1::jsonb WHERE id = $2`,
      [JSON.stringify(filtered), rows[0].id]
    );

    return res.json({ ok: true, modified: true, remaining: filtered.length });
  } catch (e) {
    console.error("Error POST /inventory/item/delete:", e);
    return res.status(500).json({ ok: false, error: "error eliminando items" });
  }
});

app.get("/submissions", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, payload, received_at FROM submissions ORDER BY received_at DESC`);
    const normalized = rows.map(r => ({
      id: r.id,
      ...(typeof r.payload === "string" ? JSON.parse(r.payload) : (r.payload || {})),
      receivedAt: r.received_at
    }));
    return res.json(normalized);
  } catch (e) {
    console.error("Error GET /submissions:", e);
    return res.status(500).json({ ok: false, error: "error leyendo submissions" });
  }
});

(async () => {
  try {
    await pool.connect().then(c => c.release());
    console.log("Conexión a PostgreSQL OK.");
    app.listen(PORT, () => {
      console.log(`Servidor iniciado en puerto ${PORT} (PID:${process.pid})`);
      if (API_TOKEN) console.log("API_TOKEN configurado para endpoints admin.");
    });
  } catch (err) {
    console.error("No se pudo iniciar el servidor:", err);
    process.exit(1);
  }
})();
