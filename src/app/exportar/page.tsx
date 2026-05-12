import { Download } from "lucide-react";

export default function ExportarPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-brand-black tracking-tight">
          Exportar
        </h1>
        <p className="mt-1 text-sm font-medium text-gray-400">
          Exportá datos en formato CSV para Fudo
        </p>
      </div>

      <div className="rounded-2xl bg-white p-8 shadow-card text-center max-w-lg mx-auto">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-cream-dark">
          <Download size={28} className="text-brand-gold-dark" strokeWidth={1.8} />
        </div>
        <h3 className="mt-5 text-lg font-bold text-brand-black">
          Exportar CSV para Fudo
        </h3>
        <p className="mt-2 text-sm text-gray-400 leading-relaxed">
          Generá un archivo CSV con los movimientos del libro diario, listo para importar en Fudo.
        </p>
        <button
          className="mt-6 inline-flex items-center gap-2.5 rounded-xl bg-brand-gold px-6 py-3.5 text-sm font-bold text-brand-black shadow-btn transition-all duration-200 hover:bg-brand-gold-light hover:shadow-btn-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-btn-active"
        >
          <Download size={16} strokeWidth={2} />
          Descargar CSV
        </button>
      </div>
    </div>
  );
}
