import { renderToStaticMarkup } from "react-dom/server";

// T8.10 (ADR-0010): quote, sales order and invoice documents as server-rendered HTML, printed to PDF by the worker (T8.11). Every
// value is a string from the database and is escaped by React; nothing here uses dangerouslySetInnerHTML, so `<img onerror>` in a
// description is printed as text (AC-33). English only (OQ-02 decides Arabic). Chromium has no network, so the CSS is inline.
// shortcut: fonts come from the worker image (T8.11) instead of being embedded; terms print as plain text, not rich text.

export type Party = { name: string; address?: string[]; vat_number?: string | null };
export type DocLine = { description: string | null; quantity: string; list_price: string; discount_amount: string; net_amount: string; vat_category: string; vat_rate: string | null; vat_amount: string; line_total: string };
export type DocumentData = {
  kind: "invoice" | "quote" | "sales_order";
  number: string;
  /** Business date (invoice date, quote date), already formatted YYYY-MM-DD. */
  date: string;
  due_date?: string | null;
  cancelled?: boolean;
  seller: Party;
  buyer: Party;
  currency: string;
  exchange_rate: string;
  lines: DocLine[];
  vat_summary: { vat_category: string; vat_rate: string | null; base: string; vat: string }[];
  totals: { sub_total: string; vat_total: string; adjustment: string; grand_total: string; vat_total_omr: string };
  terms?: string | null;
};

const TITLE = { invoice: "Tax Invoice", quote: "Quotation", sales_order: "Sales Order" } as const;
const CATEGORY: Record<string, string> = { standard: "Standard rated", zero_rated: "Zero rated", exempt: "Exempt" };

const css = `body{font:12px/1.4 sans-serif;color:#111;margin:0;padding:24px}h1{font-size:22px;margin:0}table{border-collapse:collapse;width:100%}
th,td{padding:4px 6px;border-bottom:1px solid #ccc;text-align:left}.n{text-align:right}.cols{display:flex;gap:32px;margin:16px 0}.cols>div{flex:1}
.wm{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:96px;color:rgba(200,0,0,.18);transform:rotate(-20deg)}.tot{margin-left:auto;width:55%}`;

const Address = ({ party, label }: { party: Party; label: string }) => (
  <div>
    <strong>{label}</strong>
    <div>{party.name}</div>
    {party.address?.filter(Boolean).map((line, i) => <div key={i}>{line}</div>)}
    {party.vat_number ? <div>VATIN: {party.vat_number}</div> : null}
  </div>
);

export function Document({ data }: { data: DocumentData }) {
  const { totals, currency } = data;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${TITLE[data.kind]} ${data.number}`}</title>
        <style>{css}</style>
      </head>
      <body>
        {data.cancelled ? <div className="wm">CANCELLED</div> : null}
        <h1>{TITLE[data.kind]}</h1>
        <div>No. {data.number} · Date {data.date}{data.due_date ? ` · Due ${data.due_date}` : ""}</div>
        <div className="cols">
          <Address party={data.seller} label="Seller" />
          <Address party={data.buyer} label="Buyer" />
        </div>
        <table>
          <thead>
            <tr><th>Description</th><th className="n">Qty</th><th className="n">Price</th><th className="n">Discount</th><th className="n">Net</th><th className="n">VAT %</th><th className="n">VAT</th><th className="n">Total</th></tr>
          </thead>
          <tbody>
            {data.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.description}</td><td className="n">{l.quantity}</td><td className="n">{l.list_price}</td><td className="n">{l.discount_amount}</td>
                <td className="n">{l.net_amount}</td><td className="n">{l.vat_rate ?? CATEGORY[l.vat_category] ?? l.vat_category}</td><td className="n">{l.vat_amount}</td><td className="n">{l.line_total}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>VAT summary</h3>
        <table>
          <thead><tr><th>Category</th><th className="n">Rate</th><th className="n">Taxable amount</th><th className="n">VAT</th></tr></thead>
          <tbody>
            {data.vat_summary.map((s) => (
              <tr key={s.vat_category}><td>{CATEGORY[s.vat_category] ?? s.vat_category}</td><td className="n">{s.vat_rate ?? "-"}</td><td className="n">{s.base}</td><td className="n">{s.vat}</td></tr>
            ))}
          </tbody>
        </table>
        <table className="tot">
          <tbody>
            <tr><td>Sub total</td><td className="n">{totals.sub_total} {currency}</td></tr>
            <tr><td>VAT</td><td className="n">{totals.vat_total} {currency}</td></tr>
            <tr><td>Adjustment</td><td className="n">{totals.adjustment} {currency}</td></tr>
            <tr><td><strong>Grand total</strong></td><td className="n"><strong>{totals.grand_total} {currency}</strong></td></tr>
            <tr><td>VAT in OMR{currency === "OMR" ? "" : ` (rate ${data.exchange_rate})`}</td><td className="n">{totals.vat_total_omr} OMR</td></tr>
          </tbody>
        </table>
        {data.terms ? <p style={{ whiteSpace: "pre-wrap" }}><strong>Terms</strong><br />{data.terms}</p> : null}
      </body>
    </html>
  );
}

/** The complete HTML document the worker loads into Chromium. */
export const renderDocumentHtml = (data: DocumentData) => `<!doctype html>${renderToStaticMarkup(<Document data={data} />)}`;
