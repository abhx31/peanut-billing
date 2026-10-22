import { expandBagWeights, r2 } from "@/lib/format";

type Line = { label: string; weightsText: string };

// Numbered, vertical bag-weight breakdown for prints — one column per lot
// line when there's more than one, each bag on its own row.
export function BagWeightsList({ lines }: { lines: Line[] }) {
  const withWeights = lines.filter((l) => l.weightsText.trim());
  if (withWeights.length === 0) return null;

  return (
    <div className="text-xs mb-3">
      <div className="font-semibold mb-1">Bag weights (kg):</div>
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        {withWeights.map((l, i) => {
          const weights = expandBagWeights(l.weightsText);
          return (
            <div key={i}>
              {withWeights.length > 1 && (
                <div className="font-medium mb-0.5">{l.label}</div>
              )}
              <table className="border-collapse">
                <tbody>
                  {weights.map((w, bi) => (
                    <tr key={bi}>
                      <td className="pr-2 text-gray-500">{bi + 1}.</td>
                      <td className="text-right tabular-nums">{r2(w)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
}
