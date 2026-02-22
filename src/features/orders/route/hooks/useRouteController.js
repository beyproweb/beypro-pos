import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computeDriverStats,
  computeStopsSummary,
  groupOrdersByDriver,
  selectRouteOrdersForMap,
  selectSelectedDriver,
} from "../selectors/routeSelectors";

export function useRouteController({
  orders,
  drivers,
  mapStops,
  routeOrders,
  filteredOrders,
  driverReport,
  reportLoading,
  reportFromDate,
  setReportFromDate,
  reportToDate,
  setReportToDate,
  selectedDriverId,
  setSelectedDriverId,
  refreshRoute,
  refreshDriverReport,
  t,
  formatCurrency,
  showDriverColumn = true,
}) {
  const [routeOpen, setRouteOpen] = useState(false);
  const [showDriverReport, setShowDriverReport] = useState(false);
  const refreshDriverReportRef = useRef(refreshDriverReport);

  useEffect(() => {
    refreshDriverReportRef.current = refreshDriverReport;
  }, [refreshDriverReport]);

  const selectedDriverMeta = useMemo(
    () => selectSelectedDriver(drivers, selectedDriverId),
    [drivers, selectedDriverId]
  );

  const ordersForRouteMap = useMemo(
    () => selectRouteOrdersForMap(routeOrders, filteredOrders, selectedDriverId),
    [filteredOrders, routeOrders, selectedDriverId]
  );

  const stops = useMemo(
    () => (Array.isArray(mapStops) ? mapStops : []),
    [mapStops]
  );

  const groupedOrdersByDriver = useMemo(() => groupOrdersByDriver(orders), [orders]);
  const driverStats = useMemo(() => computeDriverStats(groupedOrdersByDriver), [groupedOrdersByDriver]);
  const stopsSummary = useMemo(() => computeStopsSummary(stops), [stops]);

  const openRouteForDriver = useCallback(
    async (driverId) => {
      const effectiveDriverId =
        driverId !== undefined && driverId !== null ? driverId : selectedDriverId;
      if (driverId !== undefined && driverId !== null && setSelectedDriverId) {
        const hasValue = String(driverId).trim() !== "";
        setSelectedDriverId(hasValue ? String(driverId) : "");
      }
      await refreshRoute(effectiveDriverId);
      setRouteOpen(true);
    },
    [refreshRoute, selectedDriverId, setSelectedDriverId]
  );

  const closeRoute = useCallback(() => {
    setRouteOpen(false);
  }, []);

  const toggleDriverReport = useCallback(() => {
    setShowDriverReport((prev) => {
      const willOpen = !prev;
      if (willOpen) {
        globalThis.setTimeout(() => {
          refreshDriverReportRef.current?.();
        }, 0);
      }
      return willOpen;
    });
  }, []);

  useEffect(() => {
    if (!showDriverReport) return;
    refreshDriverReportRef.current?.();
  }, [reportFromDate, reportToDate, selectedDriverId, showDriverReport]);

  const routeProps = useMemo(
    () => ({
      open: routeOpen,
      stops,
      selectedDriver: selectedDriverMeta.selectedDriver,
      selectedDriverId,
      orders: ordersForRouteMap,
      onClose: closeRoute,
    }),
    [
      closeRoute,
      ordersForRouteMap,
      routeOpen,
      selectedDriverId,
      selectedDriverMeta.selectedDriver,
      stops,
    ]
  );

  const driverReportProps = useMemo(
    () => ({
      t,
      showDriverReport,
      reportLoading,
      driverReport,
      showDriverColumn,
      formatCurrency,
      reportFromDate,
      reportToDate,
      onChangeReportFromDate: setReportFromDate,
      onChangeReportToDate: setReportToDate,
    }),
    [
      driverReport,
      formatCurrency,
      reportFromDate,
      reportLoading,
      reportToDate,
      setReportFromDate,
      setReportToDate,
      showDriverColumn,
      showDriverReport,
      t,
    ]
  );

  return {
    routeOpen,
    setRouteOpen,
    showDriverReport,
    setShowDriverReport,
    selectedDriverId,
    setSelectedDriverId,
    selectedDriver: selectedDriverMeta.selectedDriver,
    hasSelectedDriver: selectedDriverMeta.hasSelectedDriver,
    selectedIdNum: selectedDriverMeta.selectedIdNum,
    stops,
    routeLine: null,
    driverReport,
    loading: reportLoading,
    error: driverReport?.error || "",
    ordersForRouteMap,
    driverStats,
    stopsSummary,
    reportFromDate,
    setReportFromDate,
    reportToDate,
    setReportToDate,
    routeProps,
    driverReportProps,
    openRouteForDriver,
    closeRoute,
    toggleDriverReport,
    refreshRoute,
    refreshDriverReport,
  };
}
