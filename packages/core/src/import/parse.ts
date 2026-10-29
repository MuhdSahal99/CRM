import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { ApiError } from "../http/errors.ts";

// T11.01, T11.02 (US-17, AC-56, AC-57): the CSV is untrusted input. It is size-capped, sniffed for text, and parsed as a stream with caps on
// rows, columns and record size, so a hostile file fails with a message instead of using the worker's memory.

export const LIMITS = {
  bytes: 20 * 1024 * 1024,
  rows: 100_000,
  columns: 200,
  /** Largest single record the parser buffers: a 5 MB field aborts here, long before it is held in memory. */
  recordBytes: 1024 * 1024,
  /** Longest single cell the CRM stores in any field (textarea). */
  cellChars: 32_000,
} as const;

/** A file or mapping the Admin must fix: always a 422 with a message they can act on. */
export class ImportError extends ApiError {
  constructor(message: string, api_name?: string) {
    super(422, "INVALID_DATA", message, api_name ? { api_name } : undefined);
  }
}

const MAGIC: [string, number[]][] = [["a zip or Office file", [0x50, 0x4b, 0x03, 0x04]], ["a gzip file", [0x1f, 0x8b]], ["a PDF", [0x25, 0x50, 0x44, 0x46]], ["an executable", [0x4d, 0x5a]], ["a Windows spreadsheet", [0xd0, 0xcf, 0x11, 0xe0]]];

/** The upload must be UTF-8 text: no known binary signature, no NUL byte, and valid UTF-8 in the first 64 KB (a CSV renamed from a binary fails here). */
export function sniffCsv(bytes: Uint8Array): void {
  if (bytes.byteLength === 0) throw new ImportError("The file is empty.", "file");
  for (const [what, magic] of MAGIC) if (magic.every((b, i) => bytes[i] === b)) throw new ImportError(`This looks like ${what}, not a CSV file.`, "file");
  const head = bytes.subarray(0, 65_536);
  if (head.includes(0)) throw new ImportError("This is not a text file: export the data from Zoho as CSV.", "file");
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(head, { stream: true }); // stream: a multi-byte character cut at 64 KB is not an error
  } catch {
    throw new ImportError("The file is not UTF-8 text. Export it from Zoho as CSV (UTF-8).", "file");
  }
}

/** Streams records as arrays of cells. A malformed file rejects with an ImportError that names the problem and the row. */
export async function* readCsv(source: Readable | Uint8Array): AsyncGenerator<string[]> {
  const parser = parse({
    bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: LIMITS.recordBytes,
  });
  (source instanceof Readable ? source : Readable.from([source])).on("error", (error) => parser.destroy(error)).pipe(parser);
  try {
    for await (const record of parser) yield record as string[];
  } catch (error) {
    const e = error as { code?: string; lines?: number; message?: string };
    const row = e.lines ? ` near line ${e.lines}` : "";
    if (e.code === "CSV_MAX_RECORD_SIZE") throw new ImportError(`A row${row} is larger than 1 MB. Check the file for a runaway quote or a pasted attachment.`, "file");
    if (e.code === "CSV_QUOTE_NOT_CLOSED" || e.code === "CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE" || e.code === "INVALID_OPENING_QUOTE") throw new ImportError(`The file has an unclosed or misplaced quote${row}.`, "file");
    throw new ImportError(`The file could not be read as CSV${row}.`, "file");
  } finally {
    parser.destroy();
  }
}

/** Upload-time check of the whole file: the header, the number of data rows, and the caps. Reads one record at a time. */
export async function scanCsv(bytes: Uint8Array): Promise<{ headers: string[]; rows: number }> {
  let headers: string[] | undefined;
  let rows = 0;
  for await (const record of readCsv(bytes)) {
    if (!headers) {
      headers = record.map((h) => h.trim());
      if (headers.length > LIMITS.columns) throw new ImportError(`The file has ${headers.length} columns; the limit is ${LIMITS.columns}.`, "file");
      if (headers.some((h) => !h) || new Set(headers).size !== headers.length) throw new ImportError("Every column needs a unique, non-empty heading in the first row.", "file");
      continue;
    }
    if (++rows > LIMITS.rows) throw new ImportError(`The file has more than ${LIMITS.rows.toLocaleString("en-US")} rows. Split it and import it in parts.`, "file");
  }
  if (!headers) throw new ImportError("The file has no heading row.", "file");
  if (rows === 0) throw new ImportError("The file has a heading row but no data.", "file");
  return { headers, rows };
}
