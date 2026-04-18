import React from "react";
import CategoryBar from "../../../components/transaction/CategoryBar";
import { normalizeTableDensity, TABLE_DENSITY } from "../../tables/tableDensity";

const CategoryBarRight = React.memo(function CategoryBarRight({
  categoryColumns,
  renderCategoryButton,
  topRowRef,
  topRowScroll,
  onScrollLeft,
  onScrollRight,
  disabled,
  tableDensity = TABLE_DENSITY.COMFORTABLE,
}) {
  const normalizedDensity = normalizeTableDensity(tableDensity);
  const isCompactMode =
    normalizedDensity === TABLE_DENSITY.COMPACT ||
    normalizedDensity === TABLE_DENSITY.DENSE;

  return (
    <div
      className={
        isCompactMode
          ? "flex w-[124px] sm:w-[150px] lg:w-[176px] xl:w-[188px] flex-none min-h-0 h-[calc(100vh-260px)] pt-2"
          : "flex w-[92px] sm:w-[110px] lg:w-[120px] xl:w-[180px] flex-none min-h-0 h-[calc(100vh-260px)] pt-2"
      }
    >
      <CategoryBar
        placement="right"
        categoryColumns={categoryColumns}
        renderCategoryButton={renderCategoryButton}
        topRowRef={topRowRef}
        topRowScroll={topRowScroll}
        onScrollLeft={onScrollLeft}
        onScrollRight={onScrollRight}
        disabled={disabled}
        tableDensity={normalizedDensity}
      />
    </div>
  );
});

export default CategoryBarRight;
