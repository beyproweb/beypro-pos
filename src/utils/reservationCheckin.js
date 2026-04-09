const toPositiveId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const buildCheckinPaths = ({ orderId, reservationId, pathSuffix = "" }) => {
  const suffix = String(pathSuffix || "");
  const candidateIds = [];
  const addCandidateId = (id) => {
    const normalized = toPositiveId(id);
    if (!normalized || candidateIds.includes(normalized)) return;
    candidateIds.push(normalized);
  };

  addCandidateId(orderId);
  addCandidateId(reservationId);

  const paths = [];
  const addPath = (path) => {
    if (!path || paths.includes(path)) return;
    paths.push(path);
  };

  candidateIds.forEach((id) => {
    addPath(`/orders/${id}/reservations/checkin${suffix}`);
  });
  candidateIds.forEach((id) => {
    addPath(`/orders/reservations/${id}/checkin${suffix}`);
  });

  return paths;
};

export const isReservationCheckinNotFoundError = (error) =>
  Number(error?.details?.status) === 404;

export async function postReservationCheckinWithFallback({
  request,
  orderId,
  reservationId,
  pathSuffix = "",
}) {
  if (typeof request !== "function") {
    throw new Error("Check-in request function is required");
  }

  const paths = buildCheckinPaths({ orderId, reservationId, pathSuffix });
  if (!paths.length) {
    throw new Error("Reservation record not found");
  }

  let lastNotFoundError = null;
  for (const path of paths) {
    try {
      return await request(path, { method: "POST" });
    } catch (error) {
      if (!isReservationCheckinNotFoundError(error)) throw error;
      lastNotFoundError = error;
    }
  }

  throw lastNotFoundError || new Error("Reservation check-in route not found");
}
