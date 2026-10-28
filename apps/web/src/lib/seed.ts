// Browser controls cannot preserve every integer supported by the Python API.
// Keep editable text intact and convert only after checking this contract.
export function parseBrowserSeed(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) ? seed : null;
}
