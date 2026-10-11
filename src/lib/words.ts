// Convert a non-negative integer rupee amount into Indian-system words
// (Lakh / Crore). Covers up to 9,99,99,99,999 rupees — enough for a trading firm.

const ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const tens = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return o ? `${tens[t]} ${ones[o]}` : tens[t];
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ones[h]} Hundred`);
  if (r) parts.push(twoDigits(r));
  return parts.join(" ");
}

export function numberToIndianWords(rupees: number): string {
  if (!Number.isFinite(rupees) || rupees < 0) return "";
  const n = Math.floor(rupees);
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(" ");
}

export function moneyInWords(amount: number): string {
  const whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);
  const w = numberToIndianWords(whole);
  if (paise === 0) return `Rupees ${w} Only`;
  return `Rupees ${w} and ${twoDigits(paise)} Paise Only`;
}
