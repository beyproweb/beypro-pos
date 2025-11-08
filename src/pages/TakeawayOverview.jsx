import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import secureFetch from "../utils/secureFetch";
import { PlusCircle, ShoppingBag } from "lucide-react";

export default function TakeawayOverview() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const restaurantSlug =
    localStorage.getItem("restaurant_slug") || localStorage.getItem("restaurant_id");
  const identifier = restaurantSlug ? `?identifier=${restaurantSlug}` : "";

  useEffect(() => {
    const loadTakeawayOrders = async () => {
      try {
        const data = await secureFetch(`/orders${identifier}`);
        const filtered = Array.isArray(data)
          ? data.filter(
              (o) =>
                o.order_type === "takeaway" &&
                (o.status === "occupied" ||
                  o.status === "confirmed" ||
                  o.status === "paid")
            )
          : [];
        setOrders(filtered);
      } catch (err) {
        console.error("❌ Failed to load takeaway orders:", err);
        setOrders([]);
      } finally {
        setLoading(false);
      }
    };
    loadTakeawayOrders();
  }, [identifier]);

  const handleNewTakeaway = async () => {
    try {
      const newOrder = await secureFetch(`/orders${identifier}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_type: "takeaway",
          total: 0,
          items: [],
        }),
      });
      navigate(`/transaction/phone/${newOrder.id}`, { state: { order: newOrder } });
    } catch (err) {
      console.error("❌ Failed to create new takeaway order:", err);
      alert("Could not create new takeaway order");
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        Loading takeaway orders...
      </div>
    );

  return (
    <div className="p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {/* ➕ New Takeaway Card */}
      <button
        onClick={handleNewTakeaway}
        className="border-2 border-dashed border-indigo-400 rounded-2xl p-6 flex flex-col items-center justify-center text-indigo-500 hover:bg-indigo-50 transition"
      >
        <PlusCircle className="w-10 h-10 mb-2" />
        <span className="font-semibold text-lg">New Takeaway</span>
      </button>

      {/* 🛍️ Existing takeaway orders */}
      {orders.map((order) => (
        <div
          key={order.id}
          onClick={() =>
            navigate(`/transaction/phone/${order.id}`, { state: { order } })
          }
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow hover:shadow-md transition cursor-pointer"
        >
          <div className="flex flex-col items-center justify-center text-center">
            <ShoppingBag className="w-8 h-8 text-indigo-500 mb-2" />
            <p className="font-bold text-lg text-slate-700">
              Takeaway #{order.id}
            </p>
            <p className="text-sm text-gray-500 capitalize">{order.status}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
