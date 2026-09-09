import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedSeriesByCertId } from "@/lib/publishedSeries";
import PrintButton from "./PrintButton";

interface CertificatePageProps {
  params: { certId: string };
}

export async function generateMetadata({ params }: CertificatePageProps): Promise<Metadata> {
  const series = await getPublishedSeriesByCertId(params.certId);
  return { title: series ? `Certificate — ${series.title}` : "Certificate" };
}

/**
 * Printable copyright-registration certificate for one published creator work — generated once
 * at admin approval time (see approveWork() in lib/admin.ts) and reachable from the creator
 * dashboard's "Certificate" link on that work's card. Publicly readable by design (the same way
 * a physical certificate is meant to be shown, not gated) since knowing a certId is itself proof
 * of having been handed the link.
 */
export default async function CertificatePage({ params }: CertificatePageProps) {
  const series = await getPublishedSeriesByCertId(params.certId);
  if (!series || !series.certId || !series.registrationNumber || !series.issuedAt) {
    notFound();
  }

  const issued = new Date(series.issuedAt);
  const issuedLabel = Number.isNaN(issued.getTime())
    ? series.issuedAt
    : issued.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-[#f4ecdc] px-4 py-10 text-[#2b2216] sm:py-16 print:bg-white print:py-0">
      <div className="mx-auto flex max-w-2xl justify-end print:hidden">
        <PrintButton />
      </div>

      <div className="mx-auto mt-6 max-w-2xl border-[3px] border-[#b8860b] bg-[#fffaf0] shadow-2xl print:mt-0 print:border-2 print:shadow-none">
        <div
          className="h-3 w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #c4622d 0px, #c4622d 24px, #d4a843 24px, #d4a843 48px, #3d6b4f 48px, #3d6b4f 72px)",
          }}
        />

        <div className="px-8 py-10 text-center sm:px-14 sm:py-14">
          <p className="font-cinzel text-sm tracking-[0.35em] text-[#8a6d1f]">ÍLÉOTAKU</p>
          <h1 className="mt-3 font-cinzel text-2xl text-[#2b2216] sm:text-3xl">
            Certificate of Copyright Registration
          </h1>
          <div className="mx-auto mt-5 h-px w-24 bg-[#b8860b]" />

          <p className="mt-8 font-noto text-sm text-[#5c4c30]">This certifies that the original work</p>
          <p className="mt-2 font-cinzel text-xl text-[#2b2216] sm:text-2xl">&ldquo;{series.title}&rdquo;</p>
          <p className="mt-4 font-noto text-sm text-[#5c4c30]">created and published by</p>
          <p className="mt-2 font-syne text-lg font-semibold text-[#2b2216]">{series.authorName}</p>

          <p className="mx-auto mt-8 max-w-md font-noto text-xs leading-relaxed text-[#5c4c30]">
            has been registered on the ÍléOtaku platform, confirming the author&apos;s claim of
            original authorship and copyright ownership as of the date below.
          </p>

          <div className="mx-auto mt-10 grid max-w-md grid-cols-2 gap-6 border-y border-[#b8860b]/40 py-6 text-left">
            <div>
              <p className="font-syne text-[10px] uppercase tracking-wide text-[#8a6d1f]">
                Registration Number
              </p>
              <p className="mt-1 font-noto text-sm font-semibold text-[#2b2216]">
                {series.registrationNumber}
              </p>
            </div>
            <div>
              <p className="font-syne text-[10px] uppercase tracking-wide text-[#8a6d1f]">
                Date Issued
              </p>
              <p className="mt-1 font-noto text-sm font-semibold text-[#2b2216]">{issuedLabel}</p>
            </div>
            <div className="col-span-2">
              <p className="font-syne text-[10px] uppercase tracking-wide text-[#8a6d1f]">
                Certificate ID
              </p>
              <p className="mt-1 break-all font-noto text-xs text-[#5c4c30]">{series.certId}</p>
            </div>
          </div>

          <div className="mt-10 flex items-center justify-center gap-3">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#b8860b] font-cinzel text-[10px] leading-tight text-[#8a6d1f]">
              PLATFORM
              <br />
              SEAL
            </span>
          </div>
          <p className="mt-3 font-noto text-[10px] text-[#8a6d1f]">
            Issued and held on record by ÍléOtaku
          </p>
        </div>

        <div
          className="h-3 w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #3d6b4f 0px, #3d6b4f 24px, #d4a843 24px, #d4a843 48px, #c4622d 48px, #c4622d 72px)",
          }}
        />
      </div>
    </div>
  );
}
