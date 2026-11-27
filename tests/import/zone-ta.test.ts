import { describe, expect, test } from "vitest";
import { applyZoneToBranches, shopNamesFromZone, shopsFromZoneTa, zoneText } from "@/lib/import/zone-ta";

const zone = (id: string, am = "", rm = "", ta = "") => ({ id, am, rm, ta });

describe("shopsFromZoneTa", () => {
  test("by ID; '-' and spreadsheet errors are blank; a repeated ID only fills blanks", () => {
    const shops = shopsFromZoneTa([zone("1060", "พิมพ์ณดา", "มนตรี (กอล์ฟ)", "Chanokchon"), zone("9", "-", "", "#N/A"), zone("9", "โชคชัย", "ฐกรกฤตย์", "Chuthathip"), zone("")]);
    expect(shops.get("1060")).toEqual({ full_name: "", am: "พิมพ์ณดา", rm: "มนตรี (กอล์ฟ)", ta: "Chanokchon" });
    expect(shops.get("9")).toEqual({ full_name: "", am: "โชคชัย", rm: "ฐกรกฤตย์", ta: "Chuthathip" });
    expect(shops.size).toBe(2);
    expect(zoneText(" #N/A ")).toBe("");
  });

  test("full names come from HR's Name_ column, also for shops the TA file does not list", () => {
    const names = shopNamesFromZone([
      { id: "105", name: " ID 105_Studio 7_Central_Khonkaen " },
      { id: "446", name: "ID 446_BNM_Lotus_Ladprao(ปิด12/9/69)" },
      { id: "446", name: "ID 446_BNM_Lotus_Ladprao" },
      { id: "7", name: "" },
    ]);
    expect([...names]).toEqual([["105", "ID 105_Studio 7_Central_Khonkaen"], ["446", "ID 446_BNM_Lotus_Ladprao"]]);
    const shops = shopsFromZoneTa([zone("105", "ก", "R", "Ameena")], names);
    expect(shops.get("105")).toEqual({ full_name: "ID 105_Studio 7_Central_Khonkaen", am: "ก", rm: "R", ta: "Ameena" });
    expect(shops.get("446")).toEqual({ full_name: "ID 446_BNM_Lotus_Ladprao", am: "", rm: "", ta: "" });
  });
});

describe("applyZoneToBranches", () => {
  const header = ["branch_code", "branch_name", "status", "open_date", "am", "rm"];
  const names = shopNamesFromZone([{ id: "1060", name: "ID 1060_BB_Emquartier_Sukhumvit" }]);

  test("adds the full_name and ta columns, updates shops it lists, keeps every other cell", () => {
    const values = [header, [1060, "BB Emquartier Sukhumvit", "Open", 46000, "เก่า", "R เก่า"], [], ["777", "ร้านอื่น", "Closed", "", "ก", "R"]];
    const r = applyZoneToBranches(values, shopsFromZoneTa([zone("1060", "พิมพ์ณดา", "มนตรี", "Chanokchon"), zone("5")], names));
    expect(r.addedColumns).toEqual(["full_name", "ta"]);
    expect(r.values[0]).toEqual([...header, "full_name", "ta"]);
    expect(r.values[1]).toEqual([1060, "BB Emquartier Sukhumvit", "Open", 46000, "พิมพ์ณดา", "มนตรี", "ID 1060_BB_Emquartier_Sukhumvit", "Chanokchon"]);
    expect(r.values[2]).toEqual([]);
    expect(r.values[3]).toEqual(["777", "ร้านอื่น", "Closed", "", "ก", "R"]);
    expect(r).toMatchObject({ changed: 1, notInZone: ["777"], notInBranches: ["5"] });
  });

  test("a blank in the source never wipes the tab; running it twice changes nothing more", () => {
    const values = [[...header, "full_name", "ta"], ["1060", "x", "Open", "", "ก", "R", "ID1060 : old", "Chuthathip"]];
    const once = applyZoneToBranches(values, shopsFromZoneTa([zone("1060", "", "", "#N/A")], names));
    expect(once.values[1]).toEqual(["1060", "x", "Open", "", "ก", "R", "ID 1060_BB_Emquartier_Sukhumvit", "Chuthathip"]);
    expect(once.addedColumns).toEqual([]);
    expect(applyZoneToBranches(once.values, shopsFromZoneTa([zone("1060")], names)).changed).toBe(0);
  });
});
