export const splitDrinkExtras = (extras, drinksList) => {
  const drinksLower = (drinksList || []).map((d) =>
    d.replace(/[\s\-]/g, "").toLowerCase()
  );
  const drinkExtras = [];
  const otherExtras = [];
  for (const ex of extras || []) {
    const norm = (ex.name || "").replace(/[\s\-]/g, "").toLowerCase();
    if (drinksLower.includes(norm)) {
      drinkExtras.push(ex);
    } else {
      otherExtras.push(ex);
    }
  }
  return [drinkExtras, otherExtras];
};
