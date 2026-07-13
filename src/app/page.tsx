import { InstantAccessButton } from "./instant-access-button";

export default function Home() {
  return (
    <main style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1rem" }}>
      <h1>Round</h1>
      <p>AI-facilitated Scripture reading circles.</p>
      {/* Path A entry ("Sign in with YouVersion") arrives with Step 6. */}
      <InstantAccessButton />
    </main>
  );
}
