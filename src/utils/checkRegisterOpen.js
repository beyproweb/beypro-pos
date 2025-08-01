const API_URL = import.meta.env.VITE_API_URL || "";

export const checkRegisterOpen = async () => {
  try {
    const res = await fetch(`${API_URL}/api/cash-register-status`);
    const json = await res.json();
    return json.status === "open";
  } catch (err) {
    console.error("❌ Failed to check register status:", err);
    return false;
  }
};
