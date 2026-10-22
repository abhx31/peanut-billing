export const r2 = (v: number) => Math.round(v * 100) / 100;

export const money = (v: number | string) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return "₹" + r2(n || 0).toLocaleString("en-IN");
};

export const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

export const pad2 = (v: number) => String(v).padStart(2, "0");

export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

// Indian financial year 1 Apr – 31 Mar. Date must be YYYY-MM-DD.
export const fyOf = (d: string) => {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const a = m >= 4 ? y : y - 1;
  return `${a}-${pad2((a + 1) % 100)}`;
};

// Parse "40.5 41 50x40.5" into { count, totalKg }.
// Supports space/comma/semicolon/newline separators and NxWEIGHT shorthand.
export const parseBagWeights = (input: string) => {
  let count = 0;
  let total = 0;
  input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .forEach((t) => {
      const m = t.match(/^(\d+)[x*×](\d*\.?\d+)$/i);
      if (m) {
        count += Number(m[1]);
        total += Number(m[1]) * Number(m[2]);
      } else {
        const n = num(t);
        if (n > 0) {
          count += 1;
          total += n;
        }
      }
    });
  return { count, totalKg: r2(total) };
};

// Same tokenizer as parseBagWeights, but returns one entry per bag (expanding
// "50x40.5" into 50 entries of 40.5) — used to print a numbered, vertical
// bag-weight list instead of the raw typed text.
export const expandBagWeights = (input: string): number[] => {
  const out: number[] = [];
  input
    .split(/[\s,;]+/)
    .filter(Boolean)
    .forEach((t) => {
      const m = t.match(/^(\d+)[x*×](\d*\.?\d+)$/i);
      if (m) {
        const count = Number(m[1]);
        const w = Number(m[2]);
        for (let i = 0; i < count; i++) out.push(w);
      } else {
        const n = num(t);
        if (n > 0) out.push(n);
      }
    });
  return out;
};
