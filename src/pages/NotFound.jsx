import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-gray-900 text-white text-2xl">
      ❌ Page Not Found
      <Link to="/" className="mt-4 px-4 py-2 bg-blue-500 rounded hover:bg-blue-700">
        🔙 Go Back Home
      </Link>
    </div>
  );
}
