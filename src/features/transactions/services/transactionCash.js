import {
  openCashDrawer,
  logCashRegisterEvent,
  isCashLabel,
} from "../../../utils/cashDrawer";

export const txOpenCashDrawer = (...args) => openCashDrawer(...args);
export const txLogCashRegisterEvent = (...args) => logCashRegisterEvent(...args);
export const txIsCashLabel = (...args) => isCashLabel(...args);
