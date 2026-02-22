import secureFetch from "../../../utils/secureFetch";

export async function fetchDrinksFromApi() {
  const data = await secureFetch("/drinks");
  if (!Array.isArray(data)) return [];
  return data;
}

export async function addDrinkApi(name) {
  return secureFetch("/drinks", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function removeDrinkApi(id) {
  return secureFetch(`/drinks/${id}`, { method: "DELETE" });
}
