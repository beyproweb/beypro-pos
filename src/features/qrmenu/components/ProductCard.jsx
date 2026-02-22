import React from "react";
import { useCurrency } from "../../../context/CurrencyContext";

const ProductCard = React.memo(function ProductCard({ product, apiUrl, onOpenProduct }) {
  const { formatCurrency } = useCurrency();

  return (
    <div
      onClick={() => onOpenProduct(product)}
      className="group relative bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-[2px] transition-all duration-300 cursor-pointer"
    >
      <div className="aspect-[4/5] w-full overflow-hidden bg-neutral-50 dark:bg-neutral-950">
        {product.image ? (
          <img
            src={
              /^https?:\/\//.test(product.image)
                ? product.image
                : `${apiUrl}/uploads/${product.image}`
            }
            alt={product.name}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-100 to-neutral-200 dark:from-neutral-800 dark:to-neutral-900" />
        )}
      </div>

      <div className="p-3 flex flex-col items-center text-center space-y-1.5">
        <h3 className="text-sm font-medium text-neutral-800 dark:text-neutral-100 tracking-wide group-hover:text-black dark:group-hover:text-white transition-colors line-clamp-2">
          {product.name}
        </h3>
        <p className="text-[15px] font-semibold text-neutral-700 dark:text-neutral-200 group-hover:text-neutral-900 dark:group-hover:text-white transition-colors">
          {formatCurrency(parseFloat(product.price || 0))}
        </p>
      </div>

      <span className="absolute inset-0 rounded-2xl ring-0 ring-neutral-400/0 group-hover:ring-1 group-hover:ring-neutral-300 dark:group-hover:ring-neutral-700 transition-all duration-300" />
    </div>
  );
});

export default ProductCard;
