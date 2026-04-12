export const TABLE_DENSITY = Object.freeze({
  COMFORTABLE: "comfortable",
  COMPACT: "compact",
  DENSE: "dense",
});

export const DEFAULT_TABLE_DENSITY = TABLE_DENSITY.COMFORTABLE;

export const TABLE_DENSITY_OPTIONS = Object.freeze([
  { id: TABLE_DENSITY.COMFORTABLE, label: "Comfortable" },
  { id: TABLE_DENSITY.COMPACT, label: "Compact" },
  { id: TABLE_DENSITY.DENSE, label: "Dense" },
]);

export const normalizeTableDensity = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === TABLE_DENSITY.COMPACT) return TABLE_DENSITY.COMPACT;
  if (normalized === TABLE_DENSITY.DENSE) return TABLE_DENSITY.DENSE;
  return TABLE_DENSITY.COMFORTABLE;
};

export const getTableDensityLayout = (value) => {
  const normalized = normalizeTableDensity(value);

  if (normalized === TABLE_DENSITY.DENSE) {
    return {
      density: TABLE_DENSITY.DENSE,
      minColumnWidth: 140,
      maxColumns: null,
      columnGap: 10,
      rowGap: 10,
      estimatedItemHeight: 128,
      gridWrapperClassName: "w-full flex justify-center px-3 sm:px-5 transition-all duration-200",
      containerMaxWidth: 2000,
    };
  }

  if (normalized === TABLE_DENSITY.COMPACT) {
    return {
      density: TABLE_DENSITY.COMPACT,
      minColumnWidth: 160,
      maxColumns: null,
      columnGap: 14,
      rowGap: 14,
      estimatedItemHeight: 178,
      gridWrapperClassName: "w-full flex justify-center px-4 sm:px-6 transition-all duration-200",
      containerMaxWidth: 1900,
    };
  }

  return {
    density: TABLE_DENSITY.COMFORTABLE,
    minColumnWidth: null,
    maxColumns: null,
    columnGap: null,
    rowGap: null,
    estimatedItemHeight: 345,
    gridWrapperClassName: "w-full flex justify-center px-3 sm:px-8",
    containerMaxWidth: 1600,
  };
};
