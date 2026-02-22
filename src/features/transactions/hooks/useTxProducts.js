import { useEffect, useState } from "react";

export const useTxProducts = ({
  currentUser,
  restaurantSlug,
  getInitialProducts,
  writeCachedProducts,
  normalizeExtrasGroupSelection,
  txApiGetAuthToken,
  txApiRequest,
}) => {
  const [products, setProducts] = useState(() => {
    const cached =
      typeof getInitialProducts === "function" ? getInitialProducts() : [];
    return Array.isArray(cached) ? cached : [];
  });

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const token = txApiGetAuthToken();
        let path = "/products";

        if (!token) {
          const identifierCandidates = [
            currentUser?.tenant_id,
            currentUser?.restaurant_slug,
            currentUser?.restaurant_id,
            restaurantSlug,
          ];

          const rawIdentifier =
            identifierCandidates
              .map((value) => {
                if (value === null || value === undefined) return "";
                const str = String(value).trim();
                if (!str || str === "null" || str === "undefined") return "";
                return str;
              })
              .find(Boolean) || "";

          if (rawIdentifier) {
            path = `/products?identifier=${encodeURIComponent(rawIdentifier)}`;
          }
        }

        const data = await txApiRequest(path);

        const normalized = Array.isArray(data)
          ? data.map((product) => {
              const selection = normalizeExtrasGroupSelection(
                product.selectedExtrasGroup ??
                  product.selected_extras_group ??
                  product.extrasGroupRefs
              );
              return {
                ...product,
                extrasGroupRefs: selection,
                selectedExtrasGroup: selection.ids,
                selected_extras_group: selection.ids,
                selectedExtrasGroupNames: selection.names,
              };
            })
          : [];

        setProducts(normalized);
        writeCachedProducts(normalized);
      } catch (err) {
        console.error("❌ Error fetching products:", err);
      }
    };

    fetchProducts();
  }, [
    currentUser?.tenant_id,
    currentUser?.restaurant_slug,
    currentUser?.restaurant_id,
    normalizeExtrasGroupSelection,
    restaurantSlug,
    txApiGetAuthToken,
    txApiRequest,
    writeCachedProducts,
  ]);

  return { products, setProducts };
};
