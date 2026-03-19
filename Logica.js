import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://gprkhjjpeaeapqragqlp.supabase.co";
const SUPABASE_ANON_KEY = "REEMPLAZA_CON_TU_SUPABASE_ANON_KEY";
const SERVER_BASE = "https://sever-exp.onrender.com";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

document.addEventListener("DOMContentLoaded", async () => {
  const categoriaSelect = document.getElementById("categoria");
  const btnSiguiente = document.getElementById("btnSiguiente");
  const btnRegresar = document.getElementById("btnRegresar1");
  const btnAgregar = document.getElementById("btnAgregarFila");
  const btnAgregarManual = document.getElementById("btnAgregarManual");
  const btnEliminarSeleccionados = document.getElementById("btnEliminarSeleccionados");
  const btnEnviar = document.getElementById("btnEnviarInsumos");
  const btnLogout = document.getElementById("btnLogout");
  const hospitalNombre = document.getElementById("hospitalNombre");
  const usuarioCorreo = document.getElementById("usuarioCorreo");
  const hospitalStatus = document.getElementById("hospitalStatus");
  const tituloCategoria = document.getElementById("tituloCategoria");
  const tbody = document.querySelector("#tablaInsumos tbody");

  const page1 = document.getElementById("page1");
  const page2 = document.getElementById("page2");

  const adquisicionCats = new Set(["equipo", "mobiliario", "bienesInformaticos", "instrumental"]);
  const semaforoColor = {
    expired: "#FDE2E5",
    "warning-expiry": "#FFF7E0",
    "valid-expiry": "#E8F9F0",
    default: "#FFFFFF"
  };

  let categoriaActiva = "";
  let filaContador = 0;
  let rowCreationCounter = 0;
  let selectedHospital = null;
  let hospitalMap = {};
  let catalogo = { insumos: [], material: [], equipo: [], mobiliario: [], bienesInformaticos: [], instrumental: [] };
  let session = null;

  const authHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${session?.access_token || ""}`
  });

  async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${session?.access_token || ""}` };
    if (!(options.body instanceof FormData)) headers["Content-Type"] = headers["Content-Type"] || "application/json";
    const resp = await fetch(url, { ...options, headers });
    return resp;
  }

  function showMsg(msg, ok = false) {
    if (!hospitalStatus) return;
    hospitalStatus.textContent = msg || "";
    hospitalStatus.style.color = ok ? "#065f46" : "#92400e";
  }

  function setPage(showPage2) {
    if (showPage2) {
      page1.classList.remove("activo");
      page1.classList.add("oculto");
      page2.classList.remove("oculto");
      page2.classList.add("activo");
    } else {
      page2.classList.remove("activo");
      page2.classList.add("oculto");
      page1.classList.remove("oculto");
      page1.classList.add("activo");
    }
  }

  async function checkSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    session = data.session;
    if (!session) {
      window.location.href = "auth.html";
      return false;
    }
    return true;
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "auth.html";
  }

  async function loadMe() {
    const resp = await authFetch(`${SERVER_BASE}/me`, { method: "GET" });
    if (!resp.ok) {
      if (resp.status === 401) {
        await logout();
        return null;
      }
      throw new Error(`No se pudo cargar el perfil (${resp.status})`);
    }
    const data = await resp.json();
    if (!data || !data.ok || !data.user) throw new Error("Perfil inválido");
    selectedHospital = data.user;
    hospitalNombre.value = `${data.user.hospital_nombre} (${data.user.hospital_clave})`;
    usuarioCorreo.value = data.user.email || session.user.email || "";
    showMsg(`Hospital asignado: ${data.user.hospital_nombre}`, true);
    return data.user;
  }

  async function loadBaseCatalog(categoria) {
    const resp = await authFetch(`${SERVER_BASE}/inventory-base?categoria=${encodeURIComponent(categoria)}`, { method: "GET" });
    if (!resp.ok) throw new Error(`No se pudo cargar catálogo base (${resp.status})`);
    const data = await resp.json();
    catalogo[categoria] = Array.isArray(data) ? data : [];
  }

  async function loadSavedInventory(categoria) {
    const resp = await authFetch(`${SERVER_BASE}/inventory?categoria=${encodeURIComponent(categoria)}`, { method: "GET" });
    if (!resp.ok) throw new Error(`No se pudo cargar inventario guardado (${resp.status})`);
    const data = await resp.json();
    return data && data.items && Array.isArray(data.items) ? data.items : [];
  }

  function limpiarTabla() {
    tbody.innerHTML = "";
    filaContador = 0;
    rowCreationCounter = 0;
  }

  function renumerarFilas() {
    filaContador = 0;
    for (const r of tbody.rows) {
      filaContador++;
      const noCell = r.cells[0];
      if (noCell) noCell.textContent = String(filaContador);
    }
  }

  function refreshDisabledOptions() {
    const selects = Array.from(tbody.querySelectorAll("select"));
    const selectedValues = selects.map(s => s.value).filter(Boolean);
    selects.forEach(s => {
      Array.from(s.options).forEach(opt => {
        if (!opt.value) return;
        const usedElsewhere = selectedValues.includes(opt.value) && s.value !== opt.value;
        opt.disabled = usedElsewhere;
      });
      const current = s.value;
      if (current) {
        const selected = Array.from(s.options).find(o => o.value === current);
        if (selected) selected.disabled = false;
      }
    });
  }

  function getMinimoValue(clave) {
    const list = catalogo[categoriaActiva] || [];
    const found = list.find(p => String(p.clave || "").trim() === String(clave || "").trim());
    return found && found.minimo !== null && found.minimo !== undefined ? String(found.minimo) : "";
  }

  function getRowDateValue(tr) {
    try {
      const inputCad = tr.cells[6].querySelector("input");
      const v = inputCad ? (inputCad.value || "").trim() : "";
      if (!v) return Number.POSITIVE_INFINITY;
      const d = new Date(v);
      if (Number.isNaN(d.getTime())) return Number.POSITIVE_INFINITY;
      return d.setHours(0, 0, 0, 0);
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  function sortRowsByCaducidad() {
    const rows = Array.from(tbody.rows);
    rows.sort((a, b) => {
      const da = getRowDateValue(a);
      const db = getRowDateValue(b);
      if (da === db) return (parseInt(a.dataset.order || "0", 10) - parseInt(b.dataset.order || "0", 10));
      return da - db;
    });
    const fragment = document.createDocumentFragment();
    rows.forEach(r => fragment.appendChild(r));
    tbody.appendChild(fragment);
    renumerarFilas();
    refreshDisabledOptions();
  }

  function actualizarFila(tr) {
    const inputStock = tr.cells[3].querySelector("input");
    const inputMin = tr.cells[4].querySelector("input");
    const inputCad = tr.cells[6].querySelector("input");
    const inputDias = tr.cells[7].querySelector("input");
    const estadoSpan = tr.cells[5].querySelector("span");

    const stockVal = inputStock.value === "" ? null : Math.max(0, parseInt(inputStock.value || "0", 10));
    const minVal = inputMin.value === "" ? 0 : Math.max(0, parseInt(inputMin.value || "0", 10));

    estadoSpan.textContent = stockVal === null ? "" : (stockVal < minVal ? "Bajo stock" : "Stock suficiente");
    tr.classList.remove("expired", "warning-expiry", "valid-expiry");
    inputDias.value = "";

    if (!inputCad.value) return;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fecha = new Date(inputCad.value);
    const msPorDia = 1000 * 60 * 60 * 24;
    const isAdq = adquisicionCats.has(categoriaActiva);

    if (isAdq) {
      const diffMs = hoy - fecha;
      const diasDesde = Math.ceil(diffMs / msPorDia);
      inputDias.value = diasDesde < 0 ? "En futuro" : String(diasDesde);
      tr.classList.add("valid-expiry");
      return;
    }

    const diffMs = fecha - hoy;
    const diasRest = Math.ceil(diffMs / msPorDia);
    inputDias.value = diasRest < 0 ? "Caducado" : String(diasRest);

    let meses = (fecha.getFullYear() - hoy.getFullYear()) * 12 + (fecha.getMonth() - hoy.getMonth());
    if (fecha.getDate() < hoy.getDate()) meses -= 1;

    if (meses < 0 || meses < 6) tr.classList.add("expired");
    else if (meses <= 12) tr.classList.add("warning-expiry");
    else tr.classList.add("valid-expiry");
  }

  function buildRow(producto = null, manual = false) {
    filaContador++;
    rowCreationCounter++;

    const tr = document.createElement("tr");
    tr.dataset.order = String(rowCreationCounter);
    if (manual) tr.dataset.manual = "true";

    const tdNo = document.createElement("td");
    tdNo.textContent = String(filaContador);
    tr.appendChild(tdNo);

    const tdClave = document.createElement("td");
    const select = document.createElement("select");
    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = "--Seleccione--";
    select.appendChild(optDefault);

    (catalogo[categoriaActiva] || []).forEach((p, idx) => {
      const o = document.createElement("option");
      o.value = `${p.clave || ""}||${idx}`;
      o.textContent = p.clave || "";
      o.dataset.idx = String(idx);
      o.dataset.descripcion = p.descripcion || "";
      select.appendChild(o);
    });

    tdClave.appendChild(select);
    tr.appendChild(tdClave);

    const tdDesc = document.createElement("td");
    const inputDesc = document.createElement("input");
    inputDesc.type = "text";
    inputDesc.placeholder = manual ? "Descripción obligatoria (producto no listado)" : "Escribe descripción o selecciona sugerencia";
    const datalistId = `datalist-desc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const dl = document.createElement("datalist");
    dl.id = datalistId;

    (catalogo[categoriaActiva] || []).forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.descripcion || "";
      dl.appendChild(opt);
    });

    inputDesc.setAttribute("list", datalistId);
    tdDesc.appendChild(inputDesc);
    tdDesc.appendChild(dl);
    tr.appendChild(tdDesc);

    const tdStock = document.createElement("td");
    const inputStock = document.createElement("input");
    inputStock.type = "number";
    inputStock.min = 0;
    tdStock.appendChild(inputStock);
    tr.appendChild(tdStock);

    const tdMin = document.createElement("td");
    const inputMin = document.createElement("input");
    inputMin.type = "number";
    inputMin.min = 0;
    inputMin.readOnly = true;
    inputMin.style.background = "#f3f4f6";
    tdMin.appendChild(inputMin);
    tr.appendChild(tdMin);

    const tdEstado = document.createElement("td");
    const spanEstado = document.createElement("span");
    tdEstado.appendChild(spanEstado);
    tr.appendChild(tdEstado);

    const tdCad = document.createElement("td");
    const inputCad = document.createElement("input");
    inputCad.type = "date";
    inputCad.setAttribute("aria-label", adquisicionCats.has(categoriaActiva) ? "Fecha de adquisición" : "Fecha de caducidad");
    tdCad.appendChild(inputCad);
    tr.appendChild(tdCad);

    const tdDias = document.createElement("td");
    const inputDias = document.createElement("input");
    inputDias.type = "text";
    inputDias.readOnly = true;
    tdDias.appendChild(inputDias);
    tr.appendChild(tdDias);

    const tdObs = document.createElement("td");
    const textareaObs = document.createElement("textarea");
    textareaObs.placeholder = "Observaciones";
    textareaObs.rows = 2;
    tdObs.appendChild(textareaObs);
    tr.appendChild(tdObs);

    const tdAcc = document.createElement("td");
    tdAcc.style.display = "flex";
    tdAcc.style.gap = "8px";
    tdAcc.style.alignItems = "center";

    const chk = document.createElement("input");
    chk.type = "checkbox";
    chk.className = "row-select";
    tdAcc.appendChild(chk);

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.textContent = "Eliminar";
    btnDel.className = "small-danger-btn";

    btnDel.addEventListener("click", async (ev) => {
      ev.preventDefault();
      const rowUid = tr.dataset.uid;
      const hasData = [
        inputDesc.value,
        inputStock.value,
        inputCad.value,
        textareaObs.value,
        select.value
      ].some(v => String(v || "").trim() !== "");

      if (hasData && !confirm("La fila contiene datos. ¿Eliminarla de todas formas?")) return;

      if (rowUid) {
        try {
          const resp = await authFetch(`${SERVER_BASE}/inventory/item/delete`, {
            method: "POST",
            body: JSON.stringify({
              categoria: categoriaActiva,
              uids: [rowUid]
            })
          });
          if (!resp.ok) throw new Error(`Error servidor ${resp.status}`);
          tr.remove();
          renumerarFilas();
          if (!tbody.rows.length) buildRow();
          refreshDisabledOptions();
          sortRowsByCaducidad();
          return;
        } catch (err) {
          console.error(err);
          if (!confirm("No se pudo borrar en servidor. ¿Eliminar localmente de todas formas?")) return;
        }
      }

      tr.remove();
      renumerarFilas();
      if (!tbody.rows.length) buildRow();
      refreshDisabledOptions();
      sortRowsByCaducidad();
    });

    tdAcc.appendChild(btnDel);
    tr.appendChild(tdAcc);

    tbody.appendChild(tr);

    function fillProduct(productoObj) {
      if (!productoObj) return;
      const clave = String(productoObj.clave || "").trim();
      const idx = (catalogo[categoriaActiva] || []).findIndex(p => String(p.clave || "").trim() === clave);
      if (idx >= 0) select.value = `${clave}||${idx}`;
      else select.value = clave ? `${clave}||server` : "";

      inputDesc.value = productoObj.descripcion || inputDesc.value || "";
      inputStock.value = productoObj.stock !== undefined && productoObj.stock !== null ? productoObj.stock : "";
      inputMin.value = productoObj.minimo !== undefined && productoObj.minimo !== null && String(productoObj.minimo) !== ""
        ? productoObj.minimo
        : getMinimoValue(clave);
      inputCad.value = productoObj.fecha || productoObj.caducidad || "";
      actualizarFila(tr);
      refreshDisabledOptions();
      sortRowsByCaducidad();
    }

    select.addEventListener("change", () => {
      const selectedOption = select.selectedOptions[0];
      let producto = null;
      if (selectedOption && selectedOption.dataset && selectedOption.dataset.idx !== undefined) {
        const idx = parseInt(selectedOption.dataset.idx, 10);
        producto = (catalogo[categoriaActiva] || [])[idx] || null;
      } else {
        const claveSimple = select.value ? select.value.split("||")[0] : "";
        producto = (catalogo[categoriaActiva] || []).find(p => String(p.clave || "").trim() === claveSimple) || null;
      }
      if (producto) fillProduct(producto);
      refreshDisabledOptions();
    });

    inputDesc.addEventListener("input", () => {
      const v = (inputDesc.value || "").trim().toLowerCase();
      if (!v) {
        actualizarFila(tr);
        return;
      }
      const lista = catalogo[categoriaActiva] || [];
      const exact = lista.find(p => String(p.descripcion || "").trim().toLowerCase() === v);
      if (exact) fillProduct(exact);
      else actualizarFila(tr);
    });

    inputDesc.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" && ev.key !== "Tab") return;
      const v = (inputDesc.value || "").trim().toLowerCase();
      if (!v) return;
      const lista = catalogo[categoriaActiva] || [];
      const matchesStarts = lista.filter(p => String(p.descripcion || "").trim().toLowerCase().startsWith(v));
      const matchesContains = lista.filter(p => String(p.descripcion || "").trim().toLowerCase().includes(v));
      const product = matchesStarts[0] || (matchesContains.length === 1 ? matchesContains[0] : null);
      if (product) {
        if (ev.key === "Enter") ev.preventDefault();
        fillProduct(product);
      }
    });

    inputStock.addEventListener("input", () => {
      if (inputStock.value === "") {
        actualizarFila(tr);
        return;
      }
      let v = parseInt(inputStock.value, 10);
      if (Number.isNaN(v) || v < 0) v = 0;
      inputStock.value = v;
      actualizarFila(tr);
    });

    inputCad.addEventListener("change", () => {
      actualizarFila(tr);
      sortRowsByCaducidad();
    });

    [select, inputDesc].forEach(el => {
      el.addEventListener("change", refreshDisabledOptions);
      el.addEventListener("input", refreshDisabledOptions);
      el.addEventListener("blur", refreshDisabledOptions);
    });

    if (producto) fillProduct(producto);
    else actualizarFila(tr);
    refreshDisabledOptions();
    return tr;
  }

  function getAllSelects() {
    return Array.from(tbody.querySelectorAll("select"));
  }

  function getPayloadRows() {
    const filasExport = [];
    const errors = [];
    for (const row of tbody.rows) {
      const select = row.cells[1].querySelector("select");
      const raw = select ? select.value : "";
      const claveReal = raw ? raw.split("||")[0] : "";
      const descripcion = (row.cells[2].querySelector("input").value || "").trim();
      const obsCellIndex = row.cells.length - 2;
      const observaciones = (row.cells[obsCellIndex].querySelector("textarea").value || "").trim();
      const isManual = row.dataset && row.dataset.manual === "true";

      const uid = row.dataset.uid || (row.dataset.uid = `uid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

      if (!claveReal && !descripcion && !observaciones) continue;
      if (isManual && !descripcion) {
        errors.push(`Fila ${row.rowIndex}: falta descripción para producto no listado`);
        continue;
      }

      let color = semaforoColor.default;
      if (!adquisicionCats.has(categoriaActiva)) {
        if (row.classList.contains("expired")) color = semaforoColor.expired;
        else if (row.classList.contains("warning-expiry")) color = semaforoColor["warning-expiry"];
        else if (row.classList.contains("valid-expiry")) color = semaforoColor["valid-expiry"];
      }

      filasExport.push({
        uid,
        clave: claveReal,
        descripcion,
        stock: row.cells[3].querySelector("input").value || "",
        minimo: row.cells[4].querySelector("input").value || "",
        fecha: row.cells[6].querySelector("input").value || "",
        dias: row.cells[7].querySelector("input").value || "",
        observaciones,
        color,
        manual: !!isManual
      });
    }
    return { filasExport, errors };
  }

  async function saveInventoryToServer(items) {
    const resp = await authFetch(`${SERVER_BASE}/inventory`, {
      method: "POST",
      body: JSON.stringify({
        categoria: categoriaActiva,
        items
      })
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`Error guardando inventario: ${resp.status} ${txt}`);
    }
    return resp.json().catch(() => ({}));
  }

  async function loadInventoryAndPopulate(categoria) {
    categoriaActiva = categoria;
    tituloCategoria.textContent = `Formulario de ${categoriaSelect.options[categoriaSelect.selectedIndex].text}`;

    await loadBaseCatalog(categoria);
    const savedItems = await loadSavedInventory(categoria);
    limpiarTabla();

    if (!savedItems.length) {
      buildRow();
      return;
    }

    savedItems.forEach(it => {
      const row = buildRow(null, !!it.manual);
      if (it && it.uid) row.dataset.uid = it.uid;
      if (it && it.manual) row.dataset.manual = "true";

      const selectEl = row.cells[1].querySelector("select");
      const inputDescEl = row.cells[2].querySelector("input");
      const inputStockEl = row.cells[3].querySelector("input");
      const inputMinEl = row.cells[4].querySelector("input");
      const inputFechaEl = row.cells[6].querySelector("input");
      const inputDiasEl = row.cells[7].querySelector("input");
      const textareaObs = row.cells[8].querySelector("textarea");

      inputDescEl.value = it.descripcion || "";
      inputStockEl.value = it.stock ?? "";
      inputMinEl.value = it.minimo ?? "";
      inputFechaEl.value = it.fecha || "";
      inputDiasEl.value = it.dias || "";
      textareaObs.value = it.observaciones || "";

      const clave = String(it.clave || "").trim();
      if (clave) {
        let matched = Array.from(selectEl.options).find(o => String(o.value || "").split("||")[0].trim() === clave);
        if (!matched) {
          const opt = document.createElement("option");
          opt.value = `${clave}||server`;
          opt.textContent = clave;
          opt.dataset.fromServer = "true";
          selectEl.appendChild(opt);
          matched = opt;
        }
        selectEl.value = matched.value;
      }

      actualizarFila(row);
    });

    refreshDisabledOptions();
    sortRowsByCaducidad();
  }

  function downloadCSV() {
    const { filasExport, errors } = getPayloadRows();
    if (errors.length) {
      alert("Errores:\n\n" + errors.join("\n"));
      return;
    }
    if (!filasExport.length) {
      alert("No hay datos para exportar.");
      return;
    }

    const cols = ["uid", "clave", "descripcion", "stock", "minimo", "fecha", "dias", "observaciones", "color", "manual"];
    const escapeCell = s => {
      if (s === null || s === undefined) return "";
      const str = String(s);
      return (str.includes('"') || str.includes(",") || str.includes("\n")) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    const lines = [cols.join(",")];
    for (const row of filasExport) {
      lines.push(cols.map(c => escapeCell(row[c])).join(","));
    }

    const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventario_${(selectedHospital?.hospital_clave || "hospital")}_${categoriaActiva}_${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  btnSiguiente.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const cat = categoriaSelect.value;
    if (!cat) {
      alert("Selecciona una categoría.");
      return;
    }
    try {
      await loadInventoryAndPopulate(cat);
      setPage(true);
      refreshDisabledOptions();
    } catch (err) {
      console.error(err);
      alert(err.message || "No se pudo cargar la información.");
    }
  });

  btnRegresar.addEventListener("click", (ev) => {
    ev.preventDefault();
    setPage(false);
  });

  btnAgregar.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!categoriaActiva) {
      alert("Selecciona primero una categoría.");
      return;
    }
    buildRow();
    sortRowsByCaducidad();
  });

  btnAgregarManual.addEventListener("click", (ev) => {
    ev.preventDefault();
    if (!categoriaActiva) {
      alert("Selecciona primero una categoría.");
      return;
    }
    const tr = buildRow(null, true);
    const select = tr.cells[1].querySelector("select");
    const inputDesc = tr.cells[2].querySelector("input");
    const gen = `MAN-${Date.now().toString(36).slice(-6)}`;
    const opt = document.createElement("option");
    opt.value = gen;
    opt.textContent = `${gen} (no listado)`;
    select.appendChild(opt);
    select.value = gen;
    select.disabled = true;
    inputDesc.required = true;
    inputDesc.focus();
    refreshDisabledOptions();
    sortRowsByCaducidad();
  });

  btnEliminarSeleccionados.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const checked = Array.from(tbody.querySelectorAll("input.row-select:checked"));
    if (!checked.length) {
      alert("No hay filas seleccionadas para eliminar.");
      return;
    }

    const rows = checked.map(chk => chk.closest("tr")).filter(Boolean);
    const uids = rows.map(tr => tr.dataset.uid).filter(Boolean);

    if (!confirm(`Vas a eliminar ${rows.length} fila(s). ¿Continuar?`)) return;

    if (uids.length) {
      try {
        const resp = await authFetch(`${SERVER_BASE}/inventory/item/delete`, {
          method: "POST",
          body: JSON.stringify({
            categoria: categoriaActiva,
            uids
          })
        });
        if (!resp.ok) throw new Error(`Error servidor ${resp.status}`);
      } catch (err) {
        console.error(err);
        if (!confirm("No se pudo eliminar en servidor. ¿Eliminar localmente de todas formas?")) return;
      }
    }

    rows.forEach(tr => tr.remove());
    renumerarFilas();
    if (!tbody.rows.length) buildRow();
    refreshDisabledOptions();
    sortRowsByCaducidad();
  });

  btnEnviar.addEventListener("click", async (ev) => {
    ev.preventDefault();
    const { filasExport, errors } = getPayloadRows();
    if (errors.length) {
      alert("Errores:\n\n" + errors.join("\n"));
      return;
    }
    if (!filasExport.length) {
      alert("No hay datos para enviar.");
      return;
    }

    try {
      btnEnviar.disabled = true;
      const originalText = btnEnviar.textContent;
      btnEnviar.textContent = "Guardando...";
      await saveInventoryToServer(filasExport);
      alert("Inventario guardado correctamente.");
      categoriaSelect.value = "";
      categoriaActiva = "";
      limpiarTabla();
      setPage(false);
    } catch (err) {
      console.error(err);
      alert(err.message || "No fue posible guardar el inventario.");
    } finally {
      btnEnviar.disabled = false;
      btnEnviar.textContent = "Enviar";
    }
  });

  btnLogout.addEventListener("click", async (ev) => {
    ev.preventDefault();
    await logout();
  });

  try {
    const ok = await checkSession();
    if (!ok) return;
    await loadMe();
    setPage(false);
  } catch (err) {
    console.error(err);
    window.location.href = "auth.html";
  }
});
