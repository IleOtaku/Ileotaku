import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";

export default function CtaBanner() {
  return (
    <section className="px-4 py-20 sm:px-6">
      <Reveal>
        <div className="kente-bar mx-auto max-w-4xl rounded-full" />
        <div className="mx-auto mt-8 max-w-4xl rounded-3xl border border-bg4 bg-bg2 px-8 py-14 text-center">
          <h2 className="font-cinzel text-2xl text-text sm:text-3xl">
            Your next favorite story starts here.
          </h2>
          <p className="mx-auto mt-3 max-w-md font-noto text-sm text-muted">
            Join readers in 54 countries discovering manga and comics born from the Motherland.
          </p>
          <Link href="/auth/signup" className="btn-primary mt-8 inline-flex">
            Join ÍléOtaku Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
