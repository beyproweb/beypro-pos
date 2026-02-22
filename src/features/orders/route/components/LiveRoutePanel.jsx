import LiveRouteMap from "../../../../components/LiveRouteMap";

export default function LiveRoutePanel({
  open,
  stops,
  selectedDriver,
  selectedDriverId,
  orders,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div className="relative w-full h-full max-w-7xl max-h-[95vh] mx-auto bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col dark:bg-slate-950">
        <LiveRouteMap
          stopsOverride={stops}
          driverNameOverride={selectedDriver?.name || ""}
          driverId={String(selectedDriverId || "").trim() !== "" ? String(selectedDriverId) : ""}
          orders={orders}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
