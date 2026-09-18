import { SignedIn, SignedOut, SignIn } from "@clerk/clerk-react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { Prospects } from "@/pages/Prospects";
import { Reports } from "@/pages/Reports";

export default function App() {
  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-neutral-100">
          <div className="text-center">
            <h1 className="mb-1 text-lg font-semibold text-neutral-900">
              L.I.V.E. SJ — Prospect Tracker
            </h1>
            <p className="mb-6 text-sm text-neutral-500">
              Internal team access only. Please sign in.
            </p>
            <SignIn routing="hash" />
          </div>
        </div>
      </SignedOut>

      <SignedIn>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate to="/prospects" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/prospects" element={<Prospects />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="*" element={<Navigate to="/prospects" replace />} />
          </Routes>
        </AppShell>
      </SignedIn>
    </>
  );
}
