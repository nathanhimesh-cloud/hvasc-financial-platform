import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        background: "#000",
        color: "#ededed",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        gap: 8,
      }}
    >
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>Page not found</h2>
      <p style={{ fontSize: 13, color: "#a1a1a1", marginBottom: 12 }}>
        The page you’re looking for doesn’t exist.
      </p>
      <Link
        href="/"
        style={{
          background: "#ededed",
          color: "#0a0a0a",
          borderRadius: 8,
          padding: "8px 14px",
          fontSize: 13,
          fontWeight: 500,
          textDecoration: "none",
        }}
      >
        Go to dashboard
      </Link>
    </div>
  );
}
