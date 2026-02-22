import React from "react";
import CategoryBar from "../../../components/transaction/CategoryBar";

const CategoryBarRight = React.memo(function CategoryBarRight({
  categoryColumns,
  renderCategoryButton,
  topRowRef,
  topRowScroll,
  onScrollLeft,
  onScrollRight,
  disabled,
}) {
  return (
    <div className="flex w-[92px] sm:w-[110px] lg:w-[120px] xl:w-[180px] flex-none min-h-0 h-[calc(100vh-260px)] pt-2">
      <CategoryBar
        placement="right"
        categoryColumns={categoryColumns}
        renderCategoryButton={renderCategoryButton}
        topRowRef={topRowRef}
        topRowScroll={topRowScroll}
        onScrollLeft={onScrollLeft}
        onScrollRight={onScrollRight}
        disabled={disabled}
      />
    </div>
  );
});

export default CategoryBarRight;
