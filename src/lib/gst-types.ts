// Shape of the firm-side GST profile stored in settings.gst_profile.
export type GstProfile = {
  name?: string | null;
  gstin?: string | null;
  state?: string | null;
  stateCode?: string | null;
  fssai?: string | null;
  email?: string | null;
  address?: string | null;
  bankHolder?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  declaration?: string | null;
};

// Shape stored in bills.buyer_snapshot and bills.consignee_snapshot (party-side).
export type PartySnapshot = {
  name: string;
  gstin?: string | null;
  state?: string | null;
  stateCode?: string | null;
  phone?: string | null;
  address?: string | null;
};

// Shape stored in bills.header_extras.
export type GstHeaderExtras = {
  ewb?: string;
  veh?: string;
  through?: string;
  destination?: string;
  dn?: string; // delivery note
  mp?: string; // mode/terms of payment
  rf?: string; // reference no & date
  or?: string; // other references
  bo?: string; // buyer's order no
  bd?: string; // buyer's order date
  dd?: string; // dispatch doc no
  dt?: string; // delivery note date
  lr?: string; // bill of lading / LR-RR no
  td?: string; // terms of delivery
};

// Shape stored in bills.tax_breakdown.
export type GstTaxBreakdown = {
  intra: boolean;
  pct: number;
  taxable: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  roundOff: number;
};
