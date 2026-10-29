import { ApiError, IMPORT_LIMITS, ImportModule, MappingInput, PayloadTooLarge } from "@crm/core";

// T11.01 (AC-56): reads a multipart upload with the size cap enforced while streaming, so a 2 GB body is refused after 20 MB, not buffered.
const OVERHEAD = 64 * 1024; // the form's other fields and boundaries

async function readCapped(request: Request): Promise<Uint8Array> {
  if (Number(request.headers.get("content-length")) > IMPORT_LIMITS.bytes + OVERHEAD) throw new PayloadTooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  for (let r = await reader?.read(); r && !r.done; r = await reader!.read()) {
    size += r.value.byteLength;
    if (size > IMPORT_LIMITS.bytes + OVERHEAD) {
      await reader!.cancel();
      throw new PayloadTooLarge();
    }
    chunks.push(r.value);
  }
  return Buffer.concat(chunks);
}

const bad = (message: string, field: string) => new ApiError(422, "INVALID_DATA", message, { api_name: field });

/** module + file + mapping from the multipart body of POST /imports. 413 over the cap; 422 for a missing or malformed part. */
export async function readImportUpload(request: Request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data")) throw bad("Send the file as multipart/form-data.", "file");
  const form = await new Response(Buffer.from(await readCapped(request)), { headers: { "content-type": type } }).formData().catch(() => {
    throw bad("The upload could not be read.", "file");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw bad("Attach the CSV file.", "file");
  if (file.size > IMPORT_LIMITS.bytes) throw new PayloadTooLarge();
  const target = ImportModule.safeParse(form.get("module"));
  if (!target.success) throw bad("Choose Leads, Accounts, Contacts, Deals or Products.", "module");
  let mapping: unknown;
  try {
    mapping = JSON.parse(String(form.get("mapping") ?? ""));
  } catch {
    throw bad("The mapping must be a JSON object of CSV heading to field.", "mapping");
  }
  const parsed = MappingInput.safeParse(mapping);
  if (!parsed.success) throw bad("The mapping must be a JSON object of CSV heading to field.", "mapping");
  return { module: target.data, filename: file.name || "import.csv", bytes: new Uint8Array(await file.arrayBuffer()), mapping: parsed.data };
}
