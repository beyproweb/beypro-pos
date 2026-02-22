import React from "react";
import ProductGrid from "../../../components/transaction/ProductGrid";
import CategoryBarRight from "./CategoryBarRight";
import CategoryButton from "./CategoryButton";

function ProductGridSection({
  products,
  onAddProduct,
  onOpenExtras,
  t,
  formatCurrency,
  enableProductGridVirtualization = false,
  virtualizationProductOverscan = 6,
  categoryColumns,
  renderCategoryButton,
  topRowRef,
  topRowScroll,
  onCategoryScrollUp,
  onCategoryScrollDown,
  categoryBarDisabled = false,
}) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 overflow-hidden gap-0">
        <ProductGrid
          products={products}
          onAddProduct={onAddProduct}
          onOpenExtras={onOpenExtras}
          t={t}
          formatCurrency={formatCurrency}
          enableVirtualization={enableProductGridVirtualization}
          virtualizationOverscan={virtualizationProductOverscan}
        />
        <CategoryBarRight
          categoryColumns={categoryColumns}
          renderCategoryButton={renderCategoryButton}
          topRowRef={topRowRef}
          topRowScroll={topRowScroll}
          onScrollLeft={onCategoryScrollUp}
          onScrollRight={onCategoryScrollDown}
          disabled={categoryBarDisabled}
        />
      </div>
    </div>
  );
}

export default React.memo(ProductGridSection);
