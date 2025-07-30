export const checkRegisterOpen = async () => {
  try {
    const res = await fetch("/api/reports/cash-register-status");
    const json = await res.json();
    return json.status === "open";
  } catch (err) {
    console.error("❌ Failed to check register status:", err);
    return false;
  }
};
