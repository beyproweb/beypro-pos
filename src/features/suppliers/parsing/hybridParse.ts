import { splitOcrLines } from "./common";
import { parseSupplierInvoiceWithLlm } from "./llmFallback";
import { parseSupplierInvoiceRegexV2 } from "./regexParserV2";
import { computeValidationReport } from "./validation";
import { createEmptyParsedInvoice, type SupplierInvoiceParsed } from "./types";

export type HybridParseSource = "regex" | "llm" | "hybrid";

export type HybridParseResult = {
  source: HybridParseSource;
  parsed: SupplierInvoiceParsed;
  confidence: number;
  warnings: string[];
  validation: ReturnType<typeof computeValidationReport>;
  aiUsed: boolean;
};

export type HybridParseOptions = {
  ocrLines: string[] | string;
  threshold?: number;
  aiEnabled?: boolean;
  requestLlm?: (payload: { prompt: string; schema: string; masked_text: string }) => Promise<unknown>;
};

const needsLlm = (parsed: SupplierInvoiceParsed, confidence: number, threshold: number): boolean => {
  const missingCritical =
    !parsed?.date ||
    !Number.isFinite(Number(parsed?.totals?.grand_total)) ||
    !Array.isArray(parsed.items) ||
    parsed.items.length === 0;
  return confidence < threshold || missingCritical;
};

const scoreFromParsed = (parsed: SupplierInvoiceParsed): number => {
  const validation = computeValidationReport(parsed);
  const hasVatRates = parsed.items.some((item) => Number.isFinite(Number(item?.vat_rate)));
  let score = 0;
  if (parsed.merchant) score += 0.15;
  if (parsed.date) score += 0.15;
  if (parsed.items.length >= 2) score += 0.15;
  if (Number.isFinite(Number(parsed?.totals?.grand_total))) score += 0.2;
  if (validation.grand_total_match) score += 0.2;
  if (Number.isFinite(Number(parsed?.totals?.vat_total)) || hasVatRates) score += 0.15;
  return Math.min(1, Number(score.toFixed(4)));
};

const mergeRegexAndLlm = ({
  regexParsed,
  llmParsed,
  fieldConfidence,
}: {
  regexParsed: SupplierInvoiceParsed;
  llmParsed: SupplierInvoiceParsed;
  fieldConfidence: ReturnType<typeof parseSupplierInvoiceRegexV2>["fieldConfidence"];
}) => {
  const merged: SupplierInvoiceParsed = {
    ...llmParsed,
    totals: {
      ...llmParsed.totals,
    },
  };

  let usedRegexFields = 0;
  let usedLlmFields = 0;

  const takeRegex = (confidence: number): boolean => confidence >= 0.85;

  if (takeRegex(fieldConfidence.merchant) && regexParsed.merchant) {
    merged.merchant = regexParsed.merchant;
    usedRegexFields += 1;
  } else if (llmParsed.merchant) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.date) && regexParsed.date) {
    merged.date = regexParsed.date;
    usedRegexFields += 1;
  } else if (llmParsed.date) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.invoice_no) && regexParsed.invoice_no) {
    merged.invoice_no = regexParsed.invoice_no;
    usedRegexFields += 1;
  } else if (llmParsed.invoice_no) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.currency) && regexParsed.currency) {
    merged.currency = regexParsed.currency;
    usedRegexFields += 1;
  } else if (llmParsed.currency) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.totals.grand_total) && Number.isFinite(Number(regexParsed?.totals?.grand_total))) {
    merged.totals.grand_total = regexParsed.totals.grand_total;
    usedRegexFields += 1;
  } else if (Number.isFinite(Number(llmParsed?.totals?.grand_total))) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.totals.subtotal_ex_vat) && Number.isFinite(Number(regexParsed?.totals?.subtotal_ex_vat))) {
    merged.totals.subtotal_ex_vat = regexParsed.totals.subtotal_ex_vat;
    usedRegexFields += 1;
  } else if (Number.isFinite(Number(llmParsed?.totals?.subtotal_ex_vat))) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.totals.vat_total) && Number.isFinite(Number(regexParsed?.totals?.vat_total))) {
    merged.totals.vat_total = regexParsed.totals.vat_total;
    usedRegexFields += 1;
  } else if (Number.isFinite(Number(llmParsed?.totals?.vat_total))) {
    usedLlmFields += 1;
  }

  if (takeRegex(fieldConfidence.items) && regexParsed.items.length >= 2) {
    merged.items = regexParsed.items;
    usedRegexFields += 1;
  } else {
    merged.items = llmParsed.items || [];
    if (merged.items.length > 0) usedLlmFields += 1;
  }

  return {
    merged,
    source: usedRegexFields > 0 && usedLlmFields > 0 ? ("hybrid" as const) : ("llm" as const),
  };
};

export const hybridParseSupplierInvoice = async ({
  ocrLines,
  threshold = 0.7,
  aiEnabled = true,
  requestLlm,
}: HybridParseOptions): Promise<HybridParseResult> => {
  const lines = splitOcrLines(ocrLines);
  if (!lines.length) {
    const parsed = createEmptyParsedInvoice();
    const validation = computeValidationReport(parsed);
    return {
      source: "regex",
      parsed,
      confidence: 0,
      warnings: ["Invoice text is empty."],
      validation,
      aiUsed: false,
    };
  }

  const regexResult = parseSupplierInvoiceRegexV2(lines);
  const regexValidation = computeValidationReport(regexResult.parsed);

  if (!needsLlm(regexResult.parsed, regexResult.confidence, threshold)) {
    return {
      source: "regex",
      parsed: regexResult.parsed,
      confidence: regexResult.confidence,
      warnings: regexResult.warnings,
      validation: regexValidation,
      aiUsed: false,
    };
  }

  if (!aiEnabled || !requestLlm) {
    const warnings = Array.from(
      new Set([
        ...regexResult.warnings,
        "AI assist disabled, using regex output.",
      ])
    );
    return {
      source: "regex",
      parsed: regexResult.parsed,
      confidence: regexResult.confidence,
      warnings,
      validation: regexValidation,
      aiUsed: false,
    };
  }

  try {
    const llmParsed = await parseSupplierInvoiceWithLlm({
      ocrLines: lines,
      requestLlm,
    });
    const merged = mergeRegexAndLlm({
      regexParsed: regexResult.parsed,
      llmParsed,
      fieldConfidence: regexResult.fieldConfidence,
    });
    const validation = computeValidationReport(merged.merged);
    const confidence = Math.max(regexResult.confidence, scoreFromParsed(merged.merged));
    const warnings = Array.from(new Set([
      ...regexResult.warnings,
      ...validation.warnings,
    ]));
    return {
      source: merged.source,
      parsed: merged.merged,
      confidence: Number(confidence.toFixed(4)),
      warnings,
      validation,
      aiUsed: true,
    };
  } catch {
    const warnings = Array.from(new Set([
      ...regexResult.warnings,
      "AI failed, using regex",
    ]));
    return {
      source: "regex",
      parsed: regexResult.parsed,
      confidence: regexResult.confidence,
      warnings,
      validation: regexValidation,
      aiUsed: false,
    };
  }
};
