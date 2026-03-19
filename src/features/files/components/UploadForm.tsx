"use client";

import ExtensionInstaller from "./ExtensionInstaller";

export default function UploadForm() {
  return (
    <div className="space-y-3">
      <section className="nac-card p-4 md:p-5">
        <h2 className="nac-heading text-base font-semibold">Direct Sync</h2>
        <p className="mt-1 text-sm text-slate-600">
          Use bookmarklet sync to capture attendance and process it automatically.
        </p>
      </section>
      <ExtensionInstaller />
    </div>
  );
}
