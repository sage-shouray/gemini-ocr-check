export interface Address {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  full_address: string | null;
}

export interface BankDetails {
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  swift_code: string | null;
}

export interface Vendor {
  name: string | null;
  address: Address;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  gstin: string | null;
  pan: string | null;
  bank_details: BankDetails;
}

export interface Buyer {
  name: string | null;
  address: Address;
  phone: string | null;
  email: string | null;
  tax_id: string | null;
  gstin: string | null;
  pan: string | null;
}

export interface ShipTo {
  name: string | null;
  address: Address;
}

export interface LineItem {
  line_number: number | null;
  item_code: string | null;
  hsn_sac_code: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_price: number | null;
  discount_percent: number | null;
  discount_amount: number | null;
  taxable_amount: number | null;
  tax_rate: number | null;
  tax_amount: number | null;
  cgst_rate: number | null;
  cgst_amount: number | null;
  sgst_rate: number | null;
  sgst_amount: number | null;
  igst_rate: number | null;
  igst_amount: number | null;
  total: number | null;
}

export interface Totals {
  subtotal: number | null;
  total_discount: number | null;
  taxable_amount: number | null;
  total_cgst: number | null;
  total_sgst: number | null;
  total_igst: number | null;
  total_tax: number | null;
  shipping_charges: number | null;
  grand_total: number | null;
  amount_paid: number | null;
  balance_due: number | null;
  currency: string | null;
  amount_in_words: string | null;
}

export interface ExtractionMeta {
  confidence: 'high' | 'medium' | 'low';
  warnings: string[];
  page_count: number | null;
}

export interface InvoiceExtraction {
  document_type: string | null;
  invoice_number: string | null;
  po_number: string | null;
  order_id: string | null;
  reference_number: string | null;

  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string | null;
  delivery_date: string | null;

  vendor: Vendor;
  buyer: Buyer;
  ship_to: ShipTo;

  line_items: LineItem[];
  totals: Totals;

  notes: string | null;
  terms_and_conditions: string | null;
  authorized_signatory: string | null;

  _meta: ExtractionMeta;
}

export interface SessionData {
  sessionId: string;
  createdAt: Date;
  status: 'waiting' | 'uploaded' | 'processing' | 'done' | 'error';
  extractionResult: InvoiceExtraction | null;
  error: string | null;
}

