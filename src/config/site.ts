/** País / ubicación mostrada en el panel (ej. Argentina). Definir en .env: NEXT_PUBLIC_PAIS */
export function getPaisDisplay(): string {
  return process.env.NEXT_PUBLIC_PAIS?.trim() ?? "";
}
