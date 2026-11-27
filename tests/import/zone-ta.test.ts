import { describe, expect, test } from "vitest";
import { applyZoneToBranches, shopsFromZoneTa, zoneText } from "@/lib/import/zone-ta";

const zone = (id: string, name: string, am = "", rm = "", ta = "") => ({ id, name, am, rm, ta });

describe("shopsFromZoneTa", () => {
  test("by ID; '-' and spreadsheet errors are blank; a repeated ID only fills blanks", () => {
    const shops = shopsFromZoneTa([
      zone("1060", " ID1060 : BB-Emquartier-Sukhumvit ", "พิมพ์ณดา", "มนตรี (กอล์ฟ)", "Chanokchon"),
      zone("9", "ID9 : BN-Zeer-Rangsit-2.1", "-", "", "#N/A"),
      zone("9", "ID9 : other", "โชคชัย", "ฐกรกฤตย์", "Chuthathip"),
      zone("", "no id"),
    ]);
    expect(shops.get("1060")).toEqual({ full_name: "ID1060 : BB-Emquartier-Sukhumvit", am: "พิมพ์ณดา", rm: "มนตรี (กอล์ฟ)", ta: "Chanokchon" });
    expect(shops.get("9")).toEqual({ full_name: "ID9 : BN-Zeer-Rangsit-2.1", am: "โชคชัย", rm: "ฐกรกฤตย์", ta: "Chuthathip" });
    expect(shops.size).toBe(2);
    expect(zoneText(" #N/A ")).toBe("");
  });
});

describe("applyZoneToBranches", () => {
  const header = ["branch_code", "branch_name", "status", "open_date", "am", "rm"];

  test("adds the full_name and ta columns, updates shops it lists, keeps every other cell", () => {
    const values = [header, [1060, "BB Emquartier Sukhumvit", "Open", 46000, "เก่า", "R เก่า"], [], ["777", "ร้านอื่น", "Closed", "", "ก", "R"]];
    const shops = shopsFromZoneTa([zone("1060", "ID1060 : BB-Emquartier-Sukhumvit", "พิมพ์ณดา", "มนตรี", "Chanokchon"), zone("5", "ID5 : new")]);
    const r = applyZoneToBranches(values, shops);
    expect(r.addedColumns).toEqual(["full_name", "ta"]);
    expect(r.values[0]).toEqual([...header, "full_name", "ta"]);
    expect(r.values[1]).toEqual([1060, "BB Emquartier Sukhumvit", "Open", 46000, "พิมพ์ณดา", "มนตรี", "ID1060 : BB-Emquartier-Sukhumvit", "Chanokchon"]);
    expect(r.values[2]).toEqual([]);
    expect(r.values[3]).toEqual(["777", "ร้านอื่น", "Closed", "", "ก", "R"]);
    expect(r).toMatchObject({ changed: 1, notInZone: ["777"], notInBranches: ["5"] });
  });

  test("a blank in the database never wipes the tab; running it twice changes nothing more", () => {
    const values = [[...header, "full_name", "ta"], ["1060", "x", "Open", "", "ก", "R", "ID1060 : old", "Chuthathip"]];
    const once = applyZoneToBranches(values, shopsFromZoneTa([zone("1060", "ID1060 : BB", "", "", "#N/A")]));
    expect(once.values[1]).toEqual(["1060", "x", "Open", "", "ก", "R", "ID1060 : BB", "Chuthathip"]);
    expect(once.addedColumns).toEqual([]);
    const twice = applyZoneToBranches(once.values, shopsFromZoneTa([zone("1060", "ID1060 : BB")]));
    expect(twice.changed).toBe(0);
  });
});
