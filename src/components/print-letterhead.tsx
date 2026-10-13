type Props = {
  letterheadImage: string | null | undefined;
  firm: string;
};

// Top banner for printed bills / patti / hamali / ledger. When the owner has
// uploaded a letterhead image on Settings we render that; otherwise we fall
// back to the plain firm-name heading so prints still carry an identifier.
export function PrintLetterhead({ letterheadImage, firm }: Props) {
  if (letterheadImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={letterheadImage}
        alt={firm}
        className="mb-3 w-full max-h-32 object-contain"
      />
    );
  }
  return <h1 className="text-2xl font-bold mb-1">{firm}</h1>;
}
