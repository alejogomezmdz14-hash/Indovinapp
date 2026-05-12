type BadgeVariant = "urgente" | "esta_semana" | "tiempo" | "vencida" | "por_vencer" | "al_dia";

const styles: Record<BadgeVariant, string> = {
  urgente: "bg-red-50 text-red-700 ring-red-200",
  vencida: "bg-red-50 text-red-700 ring-red-200",
  esta_semana: "bg-amber-50 text-amber-700 ring-amber-200",
  por_vencer: "bg-amber-50 text-amber-700 ring-amber-200",
  tiempo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  al_dia: "bg-emerald-50 text-emerald-700 ring-emerald-200",
};

const labels: Record<BadgeVariant, string> = {
  urgente: "Urgente",
  vencida: "Vencida",
  esta_semana: "Esta semana",
  por_vencer: "Por vencer",
  tiempo: "En tiempo",
  al_dia: "Al día",
};

interface StatusBadgeProps {
  variant: BadgeVariant;
}

export default function StatusBadge({ variant }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles[variant]}`}
    >
      {labels[variant]}
    </span>
  );
}
