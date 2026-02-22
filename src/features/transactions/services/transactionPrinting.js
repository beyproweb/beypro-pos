import {
  renderReceiptText,
  printViaBridge,
  getReceiptLayout,
} from "../../../utils/receiptPrinter";
import { fetchOrderWithItems } from "../../../utils/orderPrinting";

export const txRenderReceiptText = (...args) => renderReceiptText(...args);
export const txPrintViaBridge = (...args) => printViaBridge(...args);
export const txGetReceiptLayout = (...args) => getReceiptLayout(...args);
export const txFetchOrderWithItems = (...args) => fetchOrderWithItems(...args);
