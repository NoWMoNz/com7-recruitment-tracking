const ALIASES: Record<string, string> = {
  กรุงเทพ: "กรุงเทพมหานคร",
  กรุงเทพฯ: "กรุงเทพมหานคร",
  กทม: "กรุงเทพมหานคร",
  "กทม.": "กรุงเทพมหานคร",
  อยุธยา: "พระนครศรีอยุธยา",
  โคราช: "นครราชสีมา",
};

/** Province name as written in the Branches sheet -> the name used by the map ("จ." / "จังหวัด" prefixes are dropped). */
export function normalizeProvince(raw: string): string {
  const name = raw.trim().replace(/^(จังหวัด|จ\.)\s*/, "");
  return ALIASES[name] ?? name;
}
