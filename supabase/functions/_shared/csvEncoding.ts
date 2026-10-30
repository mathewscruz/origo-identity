/** Decode RH bytes without silently replacing accented letters. Hash the original bytes separately. */
export function decodeRhCsv(bytes: Uint8Array): string {
  const hasUtf8Bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const utf16 = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : null;
  let text: string;
  if (utf16) {
    text = new TextDecoder(utf16, { fatal: true }).decode(bytes);
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (error) {
      if (hasUtf8Bom) throw error;
      // Legacy Excel CSVs use Windows-1252 for Portuguese accents.
      text = new TextDecoder("windows-1252", { fatal: true }).decode(bytes);
    }
  }
  if (text.includes("\uFFFD")) throw new Error("Arquivo do RH contém caracteres corrompidos; solicite uma cópia íntegra antes de importar.");
  return text.replace(/^\uFEFF/, "");
}