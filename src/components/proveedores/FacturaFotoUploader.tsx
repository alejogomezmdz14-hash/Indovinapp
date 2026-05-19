"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2 } from "lucide-react";

export default function FacturaFotoUploader() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(
    null
  );

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMessage(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.set("foto", file);
      const res = await fetch("/api/facturas/desde-foto", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as { ok?: boolean; error?: string; proveedor?: string };
      if (!res.ok) {
        setMessage({ type: "err", text: body.error || "No se pudo guardar" });
        return;
      }
      setMessage({
        type: "ok",
        text: `Listo: ${body.proveedor ?? "Factura"} guardada.`,
      });
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "Error de red. Probá de nuevo." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-dashed border-brand-gold/40 bg-brand-cream/50 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-bold text-brand-black flex items-center gap-2">
            <Camera size={18} className="text-brand-gold-dark" strokeWidth={1.8} />
            Factura por foto
          </h3>
          <p className="mt-1 text-sm text-gray-500 max-w-xl">
            Sacá una foto al comprobante. Se lee con IA, se agrega una fila en{" "}
            <strong>proveedores</strong> y el desglose en <strong>Libro diario</strong>.
            Si no ves los datos al instante, recargá la página.
          </p>
        </div>
        <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-black px-5 py-3 text-sm font-semibold text-brand-gold shadow-btn transition hover:-translate-y-0.5 disabled:opacity-50">
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} />
              Procesando…
            </>
          ) : (
            <>
              <Camera size={18} strokeWidth={1.8} />
              Subir foto
            </>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            disabled={loading}
            onChange={onFileChange}
          />
        </label>
      </div>
      {message && (
        <p
          className={`mt-3 text-sm font-medium ${message.type === "ok" ? "text-emerald-700" : "text-brand-wine"}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
