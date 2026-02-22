import { extractQty } from "../qtyParser";

// Quick harness for manual checks in dev.
// Example (browser dev console):
// await import('/src/features/voiceOrder/__debug__/qtyParser.quicktest.js').then((m) => m.runQuickQtyParserTests());

const TEST_CASES = [
  { lang: "en", segment: "5 chicken burger", expected: 5 },
  { lang: "en", segment: "two chicken burger", expected: 2 },
  { lang: "en", segment: "burger 5", expected: 5 },
  { lang: "en", segment: "burger 10 tl", expected: null },
  { lang: "tr", segment: "5 tavuk burger", expected: 5 },
  { lang: "tr", segment: "üç tavuk burger", expected: 3 },
  { lang: "tr", segment: "tavuk burger 10 tl", expected: null },
  { lang: "de", segment: "fünf chicken burger", expected: 5 },
  { lang: "fr", segment: "cinq chicken burger", expected: 5 },
  { lang: "en", segment: "3", expected: 3 },
];

export function runQuickQtyParserTests() {
  let passCount = 0;

  TEST_CASES.forEach((test) => {
    const result = extractQty(test.segment, test.lang);
    const actual = Number.isFinite(result.qty) ? result.qty : null;
    const ok = actual === test.expected;
    if (ok) passCount += 1;

    // eslint-disable-next-line no-console
    console.log(
      `[qty-test] ${ok ? "PASS" : "FAIL"} | ${test.lang} | "${test.segment}" =>`,
      { actual, expected: test.expected, source: result.source, ignored: result.ignoredTokens }
    );
  });

  // eslint-disable-next-line no-console
  console.log(`[qty-test] ${passCount}/${TEST_CASES.length} passed`);

  return { passCount, total: TEST_CASES.length };
}

if (typeof process !== "undefined" && process?.argv?.includes("--run")) {
  runQuickQtyParserTests();
}
