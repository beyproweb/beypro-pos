function detectBrand(num) {
  const n = (num || "").replace(/\s+/g, "");
  if (/^4\d{6,}$/.test(n)) return "Visa";
  if (/^(5[1-5]\d{4,}|2[2-7]\d{4,})$/.test(n)) return "Mastercard";
  if (/^3[47]\d{5,}$/.test(n)) return "Amex";
  return "Card";
}

function luhnValid(num) {
  const n = (num || "").replace(/\D/g, "");
  let sum = 0;
  let dbl = false;
  for (let i = n.length - 1; i >= 0; i -= 1) {
    let d = +n[i];
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return n.length >= 12 && sum % 10 === 0;
}

function parseExpiry(exp) {
  const s = (exp || "").replace(/[^\d]/g, "").slice(0, 4);
  const mm = s.slice(0, 2);
  const yy = s.slice(2, 4);
  return { mm, yy };
}

function expiryValid(exp) {
  const { mm, yy } = parseExpiry(exp);
  if (mm.length !== 2 || yy.length !== 2) return false;
  const m = +mm;
  if (m < 1 || m > 12) return false;
  const now = new Date();
  const yFull = 2000 + +yy;
  const end = new Date(yFull, m, 0, 23, 59, 59);
  return end >= new Date(now.getFullYear(), now.getMonth(), 1);
}

function makeToken() {
  return crypto?.randomUUID?.() ?? `tok_${Math.random().toString(36).slice(2)}`;
}

function formatCardNumber(v) {
  return v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(v) {
  const s = v.replace(/[^\d]/g, "").slice(0, 4);
  if (s.length <= 2) return s;
  return `${s.slice(0, 2)}/${s.slice(2)}`;
}

export {
  detectBrand,
  expiryValid,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  makeToken,
  parseExpiry,
};
