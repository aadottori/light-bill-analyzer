// Utilitários de formatação e ordenação compartilhados pelas páginas.

const MONTHS = { JAN: 0, FEV: 1, MAR: 2, ABR: 3, MAI: 4, JUN: 5, JUL: 6, AGO: 7, SET: 8, OUT: 9, NOV: 10, DEZ: 11 };
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export const formatBRL = (v) =>
  v === null || v === undefined || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Valores compactos para eixos e cartões: R$ 1,2 mi / R$ 350 mil
export const formatBRLCompact = (v) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e3) return `R$ ${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `R$ ${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

export const formatNumber = (v, digits = 0) =>
  v === null || v === undefined || v === ""
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const formatDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

export const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString("pt-BR") : "—");

// "JAN/2025" -> "jan/25"
export const shortMonth = (m) => {
  if (!m) return "";
  const [mon, year] = m.split("/");
  const i = MONTHS[mon?.toUpperCase()];
  return i === undefined ? m : `${MONTH_NAMES[i]}/${String(year).slice(-2)}`;
};

export const monthKey = (m) => {
  if (!m) return -1;
  const [mon, year] = m.split("/");
  return Number(year) * 12 + (MONTHS[mon?.toUpperCase()] ?? 0);
};

// Categoria de um item da fatura, para rótulos e agrupamentos
export const itemCategory = (desc = "") => {
  const d = desc.toLowerCase();
  if (d.includes("ultrapassagem")) return { label: "Ultrapassagem", tone: "bad" };
  if (d.includes("reativ")) return { label: "Reativo excedente", tone: "warn" };
  if (d.includes("multa") || d.includes("juros")) return { label: "Multa/juros", tone: "bad" };
  if (d.includes("imposto") || d.includes("contribui") || d.includes("ipca") || d.includes("fecp")) return { label: "Tributos e encargos", tone: "neutral" };
  if (d.includes("demanda")) return { label: "Demanda", tone: "violet" };
  if (d.includes("energia") || d.includes("disponibilidade")) return { label: "Energia", tone: "blue" };
  return { label: "Outros", tone: "neutral" };
};

// Número em formato brasileiro ("1.234,56") ou número JS -> Number
export const parseBR = (v) => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
};

export const sortByMonth = (arr, key = "month") => [...arr].sort((a, b) => monthKey(a[key]) - monthKey(b[key]));
export const sortMonths = (months) => [...months].sort((a, b) => monthKey(a) - monthKey(b));
