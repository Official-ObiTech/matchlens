import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card empty">
      <h3>Page not found</h3>
      <Link className="btn btn-sm" href="/">Back to home</Link>
    </div>
  );
}
