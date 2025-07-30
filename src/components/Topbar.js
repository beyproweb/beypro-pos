export default function Topbar() {
  return (
    <div className="bg-white shadow-md p-4 flex justify-between items-center">
      <h2 className="text-xl font-bold">Dashboard</h2>
      <button className="bg-red-500 text-white px-4 py-2 rounded">🔴 Logout</button>
    </div>
  );
}
