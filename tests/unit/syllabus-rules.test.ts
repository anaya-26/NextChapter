import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateMinutes, joinContinuations, parseSyllabusText, splitItems } from "@/lib/syllabus/rules";

const sample = readFileSync("tests/fixtures/sample-syllabus.txt", "utf8");

describe("rule-based syllabus parser", () => {
  it("extracts units (chapters within units), topics and stated assessment", () => {
    const r = parseSyllabusText(sample);
    expect(r.title).toMatch(/^PHYSICS — CLASS XII/);
    expect(r.units.map((u) => u.title)).toEqual([
      "Unit I: Electrostatics · Chapter 1: Electric Charges and Fields",
      "Unit I: Electrostatics · Chapter 2: Electrostatic Potential and Capacitance",
      "Unit II: Current Electricity · Chapter 3: Current Electricity",
      "Unit III: Magnetic Effects of Current and Magnetism · Chapter 4: Moving Charges and Magnetism",
    ]);
    const ch1 = r.units[0].topics.map((t) => t.title);
    expect(ch1).toContain("Coulomb's law");
    expect(ch1).toContain("Gauss's theorem and its applications");
    expect(r.units[2].topics.map((t) => t.title)).toEqual([
      "Electric current",
      "Drift velocity",
      "Ohm's law",
      "Resistivity and its temperature dependence",
      "Kirchhoff's laws",
      "Wheatstone bridge",
      "Potentiometer",
    ]);
    // Only explicitly stated assessment details.
    expect(r.assessment).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Unit I: Electrostatics", detail: "16 marks" }),
        expect.objectContaining({ label: "Unit II: Current Electricity", detail: "12 marks" }),
        expect.objectContaining({ label: "Theory examination", detail: "70 marks, 3 hours" }),
        expect.objectContaining({ label: "Practical examination" }),
      ]),
    );
    expect(r.assessment.some((a) => a.label.startsWith("Unit III"))).toBe(false);
    expect(r.units.every((u) => u.topics.every((t) => !t.uncertain))).toBe(true);
  });

  it("rejoins lines broken by OCR and flags unreadable noise", () => {
    const ocr = [
      "Unit 1 - Algebra",
      "Sets, relations and functions; complex numbers; quadratic",
      "equations; permutations and combinations",
      "~|^ ¥¥ ||| 3%4",
      "Unit 2 - Calculus",
      "• Limits and continuity",
      "• Differentiation and its applica-",
      "tions",
    ].join("\n");
    const r = parseSyllabusText(ocr, { ocrConfidence: 62 });
    expect(r.units.map((u) => u.title)).toEqual(["Unit 1: Algebra", "Unit 2: Calculus"]);
    expect(r.units[0].topics.map((t) => t.title)).toEqual(["Sets, relations and functions", "Complex numbers", "Quadratic equations", "Permutations and combinations"]);
    expect(r.units[1].topics.map((t) => t.title)).toEqual(["Limits and continuity", "Differentiation and its applications"]);
    expect(r.unreadable).toHaveLength(1);
    expect(r.warnings.join(" ")).toMatch(/confidence was low \(62%\)/);
  });

  it("groups headingless lists and says so", () => {
    const r = parseSyllabusText("Topics to study\nPhotosynthesis\nRespiration in plants\nTranspiration");
    expect(r.units).toHaveLength(1);
    expect(r.units[0].uncertain).toBe(true);
    expect(r.units[0].topics).toHaveLength(3);
    expect(r.warnings.join(" ")).toMatch(/No unit or chapter headings/);
  });

  it("splits lists sensibly", () => {
    expect(splitItems("Capacitors, capacitance, combination of capacitors")).toEqual(["Capacitors", "capacitance", "combination of capacitors"]);
    expect(splitItems("Force on a charge (in electric, magnetic fields)")).toHaveLength(1);
    expect(joinContinuations(["Topics: a; b;", "c and d"])).toEqual(["Topics: a; b; c and d"]);
    expect(estimateMinutes("Kirchhoff's laws")).toBe(90);
    expect(estimateMinutes("Introduction to cells")).toBe(40);
  });
});
