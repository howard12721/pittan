const segmenter = new Intl.Segmenter("ja", { granularity: "grapheme" });
export function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}
export function textLength(value: string) {
  return [...segmenter.segment(value)].length;
}
export function validText(value: string, limit: number) {
  return (
    new TextEncoder().encode(value).byteLength <= 4096 &&
    value.trim().length > 0 &&
    textLength(value) <= limit
  );
}
export function initial(value: string) {
  return [...segmenter.segment(value)][0]?.segment ?? "";
}
