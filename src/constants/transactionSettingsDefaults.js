export const DEFAULT_TRANSACTION_SETTINGS = {
  autoCloseTableAfterPay: false,
  autoClosePacketAfterPay: false,
  // null = all methods, [] = none, ["cash", ...] = subset
  autoClosePacketAfterPayMethods: null,
  presetNotes: ["No ketchup", "Extra spicy", "Sauce on side", "Well done"],
  disableAutoPrintTable: false,
  disableAutoPrintPacket: false,
  disableTableOverviewOrdersFloatingButton: false,
  disableTableOverviewGuestsFloatingButton: false,
  requireGuestsBeforeOpen: true,
};
