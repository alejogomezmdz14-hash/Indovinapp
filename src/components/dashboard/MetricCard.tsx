interface MetricCardProps {
  label: string;
  valor: string;
  subtexto: string;
  color: "green" | "red" | "neutral";
}

const colorStyles = {
  green: "text-emerald-600",
  red: "text-brand-wine",
  neutral: "text-brand-black",
};

const accentBar = {
  green: "bg-emerald-400",
  red: "bg-brand-wine",
  neutral: "bg-brand-gold",
};

export default function MetricCard({
  label,
  valor,
  subtexto,
  color,
}: MetricCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-brand-cream p-5 shadow-card transition-all duration-300 hover:shadow-card-hover hover:-translate-y-0.5 group">
      <div className={`absolute top-0 left-0 h-1 w-full ${accentBar[color]}`} />
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight ${colorStyles[color]}`}>
        {valor}
      </p>
      <p className="mt-1 text-xs text-gray-400">{subtexto}</p>
    </div>
  );
}
