"use client";

import { Printer } from "lucide-react";

/** Triggers the browser's native print dialog — the certificate page's own print stylesheet
 * (see the `print:` classes on the page) hides this button and everything but the certificate
 * card itself when it fires. */
export default function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary mt-6">
      <Printer className="h-4 w-4" /> Print / Download
    </button>
  );
}
