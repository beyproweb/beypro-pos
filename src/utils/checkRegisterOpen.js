import secureFetch from "../utils/secureFetch";

export const checkRegisterOpen = async () => {
  try {
    const data = await secureFetch(`/reports/cash-register-status`);
    return data.status === "open";
  } catch (err) {
    console.error("❌ Failed to check register status:", err);
    return false;
  }
};
