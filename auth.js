import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "REEMPLAZA_CON_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "REEMPLAZA_CON_TU_SUPABASE_ANON_KEY";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const authMessage = document.getElementById("authMessage");

function setMsg(text, ok = false) {
  authMessage.textContent = text || "";
  authMessage.style.color = ok ? "#065f46" : "#92400e";
}

async function goToApp() {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData && sessionData.session) {
    window.location.href = "Formu.html";
  }
}

btnLogin.addEventListener("click", async (ev) => {
  ev.preventDefault();
  const email = (emailEl.value || "").trim();
  const password = (passwordEl.value || "").trim();

  if (!email || !password) {
    setMsg("Escribe correo y contraseña.");
    return;
  }

  btnLogin.disabled = true;
  setMsg("Validando sesión...");

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data && data.session) {
      setMsg("Acceso concedido.", true);
      window.location.href = "Formu.html";
      return;
    }

    setMsg("No se pudo iniciar sesión.");
  } catch (err) {
    console.error(err);
    setMsg(err.message || "Error al iniciar sesión.");
  } finally {
    btnLogin.disabled = false;
  }
});

goToApp().catch(() => {});
