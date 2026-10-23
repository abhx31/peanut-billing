import { expandBagWeights, r2 } from "@/lib/format";

type Line = { label: string; weightsText: string };

// How many bags go in one column before wrapping to the next — keeps a long
// bag list from running down the page into a second sheet.
const ROWS_PER_COLUMN = 12;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Numbered bag-weight breakdown for prints — wraps into side-by-side
// columns (instead of one long vertical list) so it stays compact on the
// page, with a column per lot line when there's more than one lot.
export function BagWeightsList({ lines }: { lines: Line[] }) {
  const withWeights = lines.filter((l) => l.weightsText.trim());
  if (withWeights.length === 0) return null;

  return (
    <div className="text-xs mb-3">
      <div className="font-semibold mb-1">Bag weights (kg):</div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {withWeights.map((l, i) => {
          const weights = expandBagWeights(l.weightsText);
          const columns = chunk(weights, ROWS_PER_COLUMN);
          return (
            <div key={i}>
              {withWeights.length > 1 && (
                <div className="font-medium mb-0.5">{l.label}</div>
              )}
              <div className="flex flex-wrap gap-x-4">
                {columns.map((col, ci) => (
                  <table key={ci} className="border-collapse break-inside-avoid">
                    <tbody>
                      {col.map((w, bi) => (
                        <tr key={bi}>
                          <td className="pr-2 text-gray-500">
                            {ci * ROWS_PER_COLUMN + bi + 1}.
                          </td>
                          <td className="text-right tabular-nums">{r2(w)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
