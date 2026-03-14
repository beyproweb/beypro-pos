import LiveRouteMap from "../../../../components/LiveRouteMap";

export default function LiveRoutePanel({
  open,
  stops,
  drivers = [],
  selectedDriver,
  selectedDriverId,
  orders,
  onClose,
}) {
  if (!open) return null;

  // Respect the page filter strictly: when "All Drivers" is selected,
  // do not infer a single driver id from orders.
  const effectiveDriverId = String(selectedDriverId || "").trim();

  const selectedDriverIdRaw = effectiveDriverId;
  const matchedDriver =
    selectedDriver ||
    (Array.isArray(drivers) ? drivers : []).find((driver) => {
      const candidateIds = [
        driver?.id,
        driver?.staff_id,
        driver?.driver_id,
        driver?.user_id,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean);

      return candidateIds.includes(selectedDriverIdRaw);
    }) ||
    null;

  const orderDriverName =
    (Array.isArray(orders) ? orders : [])
      .map((order) =>
        order?.driver_name ||
        order?.driverName ||
        order?.driver?.name ||
        order?.driver?.full_name ||
        ""
      )
      .find(Boolean) || "";

  const driverName =
    matchedDriver?.name ||
    matchedDriver?.full_name ||
    matchedDriver?.driver_name ||
    matchedDriver?.username ||
    selectedDriver?.name ||
    selectedDriver?.full_name ||
    selectedDriver?.driver_name ||
    selectedDriver?.username ||
    orderDriverName ||
    "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
      <div className="relative w-full h-full max-w-7xl max-h-[95vh] mx-auto bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col dark:bg-slate-950">
        <LiveRouteMap
          stopsOverride={stops}
          driverNameOverride={driverName}
          driverId={effectiveDriverId}
          orders={orders}
          drivers={drivers}
          onClose={onClose}
        />
      </div>
    </div>
  );
}
