import { describe, expect, it } from "vitest";
import { parseSupplierInvoiceRegexV2 } from "../regexParserV2";

const cocaColaFixture = [
  "COCA COLA ICECEK A.Ş.",
  "Tarih: 12.01.2026",
  "Fatura No: CC-2026-00123",
  "1 KOLA PET 2x24 ADET 11,50 552,00",
  "2 FANTA 1x24 ADET 10,00 240,00",
  "ARA TOPLAM 792,00",
  "KDV %8 63,36",
  "GENEL TOPLAM 855,36 ₺",
];

const pepsiFixture = [
  "PEPSI COLA SERVIS VE DAGITIM LTD. ŞTİ.",
  "Date: 10/01/2026",
  "Belge No: P-441928",
  "YEDITEPE GAZOZ 10 ADET 14,00 140,00",
  "LIPTON ICE TEA 8 ADET 18,50 148,00",
  "KDV TOPLAM 23,04",
  "GENEL TOPLAM 311,04",
];

const migrosFixture = [
  "MIGROS TICARET A.S.",
  "Tarih 2026-01-09",
  "SUT 1 LT 45,00",
  "YUMURTA 10 AD 69,90",
  "PILAVLIK PIRINC 2 KG 120,00",
  "TOPLAM 234,90",
];

const a101Fixture = [
  "A101 YENI MAGAZACILIK A.Ş.",
  "Tarih: 08.01.2026",
  "SOGAN 1 KG 29,95",
  "DOMATES 1 KG 54,90",
  "ODENECEK TUTAR 84,85",
];

const metroFixture = [
  "METRO GROSSMARKET BAKIRKOY",
  "Tarih: 05.01.2026",
  "Fis No: MTR-7782",
  "KIRMIZI ET 1,25 KG 485,00",
  "SALATALIK 3,50 KG 89,25",
  "KDV TOPLAM 45,17",
  "GENEL TOPLAM 619,42",
];

const messyFixture = [
  "ABC GIDA SAN. TİC. LTD. ŞTİ.",
  "Vergi Dairesi: Bakirkoy",
  "IBAN TR33 0006 7000 0000 0000 0000 00",
  "Tel: 0532 111 22 33",
  "Tarih : 07/01/2026",
  "E-Arşiv No : EA-99331",
  "1 AYRAN 12 ADET 11,00 132,00",
  "2 TOST EKMEGI 5 ADET 19,50 97,50",
  "KDV %10 20,86",
  "GENEL TOPLAM 229,36",
];

describe("parseSupplierInvoiceRegexV2", () => {
  it("parses Coca-Cola distributor style with 2x24 packs", () => {
    const result = parseSupplierInvoiceRegexV2(cocaColaFixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed.totals.grand_total).toBeCloseTo(855.36, 2);
    expect(result.parsed.invoice_no).toContain("CC-2026");
  });

  it("parses Pepsi invoice and captures VAT total", () => {
    const result = parseSupplierInvoiceRegexV2(pepsiFixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed.totals.vat_total).toBeCloseTo(23.04, 2);
    expect(result.parsed.totals.grand_total).toBeCloseTo(311.04, 2);
  });

  it("parses Migros receipt style totals", () => {
    const result = parseSupplierInvoiceRegexV2(migrosFixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed.totals.grand_total).toBeCloseTo(234.9, 2);
  });

  it("parses A101 short receipt without invoice number", () => {
    const result = parseSupplierInvoiceRegexV2(a101Fixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed.invoice_no).toBeNull();
    expect(result.parsed.totals.grand_total).toBeCloseTo(84.85, 2);
  });

  it("parses Metro wholesale with kg lines", () => {
    const result = parseSupplierInvoiceRegexV2(metroFixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed.totals.grand_total).toBeCloseTo(619.42, 2);
  });

  it("ignores IBAN/phone/address style noise", () => {
    const result = parseSupplierInvoiceRegexV2(messyFixture);
    expect(result.parsed.items.length).toBeGreaterThanOrEqual(2);
    const names = result.parsed.items.map((item) => item.name.toLowerCase()).join(" ");
    expect(names).not.toContain("iban");
    expect(names).not.toContain("tel");
    expect(names).not.toContain("vergi");
  });

  it("increases confidence when totals match", () => {
    const matchFixture = [
      "ORNEK GIDA LTD. ŞTİ.",
      "Tarih: 11.01.2026",
      "Fatura No: OR-2026-77",
      "URUN A 2 ADET 50,00 100,00",
      "URUN B 1 ADET 25,00 25,00",
      "GENEL TOPLAM 125,00",
    ];
    const matched = parseSupplierInvoiceRegexV2(matchFixture);
    const mismatched = parseSupplierInvoiceRegexV2([
      ...matchFixture.slice(0, -1),
      "GENEL TOPLAM 199,99",
    ]);
    expect(matched.confidence).toBeGreaterThan(mismatched.confidence);
  });
});
