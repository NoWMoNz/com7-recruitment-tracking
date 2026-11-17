import { describe, expect, test } from "vitest";
import {
  addDays,
  daysBetween,
  formatThaiDate,
  localDateToSerial,
  parseUserDate,
  serialToLocalDate,
  todayBangkok,
} from "@/lib/domain/dates";

describe("todayBangkok", () => {
  test("uses Bangkok date, not UTC", () => {
    expect(todayBangkok(new Date("2026-11-17T18:30:00Z"))).toBe("2026-11-18");
    expect(todayBangkok(new Date("2026-11-17T16:59:00Z"))).toBe("2026-11-17");
  });
});

describe("daysBetween", () => {
  test("counts calendar days, to minus from", () => {
    expect(daysBetween("2026-10-02", "2026-11-17")).toBe(46);
    expect(daysBetween("2026-11-17", "2026-11-17")).toBe(0);
    expect(daysBetween("2026-11-20", "2026-11-17")).toBe(-3);
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});

describe("formatThaiDate", () => {
  test("formats dd/mm/yyyy and dash for null", () => {
    expect(formatThaiDate("2026-11-07")).toBe("07/11/2026");
    expect(formatThaiDate(null)).toBe("-");
  });
});

describe("parseUserDate", () => {
  test("accepts dd/mm/yyyy, d/m/yyyy, ISO and trims", () => {
    expect(parseUserDate("17/11/2026")).toBe("2026-11-17");
    expect(parseUserDate("7/1/2026")).toBe("2026-01-07");
    expect(parseUserDate("2026-11-17")).toBe("2026-11-17");
    expect(parseUserDate(" 17/11/2026 ")).toBe("2026-11-17");
  });
  test("converts Buddhist-era years", () => {
    expect(parseUserDate("17/11/2569")).toBe("2026-11-17");
  });
  test("rejects impossible or non-date input", () => {
    expect(parseUserDate("31/02/2026")).toBeNull();
    expect(parseUserDate("ไม่ทราบ")).toBeNull();
    expect(parseUserDate("")).toBeNull();
  });
});

describe("sheet serial", () => {
  test("round trips and ignores time part", () => {
    expect(localDateToSerial("2026-11-17")).toBe(46343);
    expect(serialToLocalDate(46343)).toBe("2026-11-17");
    expect(serialToLocalDate(46343.75)).toBe("2026-11-17");
  });
});

describe("addDays", () => {
  test("adds negative days", () => {
    expect(addDays("2026-11-17", -3)).toBe("2026-11-14");
  });
});
