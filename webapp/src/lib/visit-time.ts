export function formatVisitTime(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta", weekday: "long", day: "numeric", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(new Date(value)) + " WIB" : "Belum tercatat";
}
