export async function getDeviceLocation(
  geolocation: Pick<Geolocation, "getCurrentPosition">,
  onFallback: () => void,
): Promise<GeolocationPosition> {
  const request = (enableHighAccuracy: boolean) => new Promise<GeolocationPosition>((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy,
      timeout: enableHighAccuracy ? 12000 : 15000,
      maximumAge: 0,
    });
  });
  try { return await request(true); }
  catch (error) {
    // A denied permission needs user action; retry only provider/timeout failures.
    const code = (error as GeolocationPositionError).code;
    if (code !== 2 && code !== 3) throw error;
    onFallback();
    return request(false);
  }
}

export function locationErrorMessage(error: unknown): string {
  switch ((error as GeolocationPositionError)?.code) {
    case 1: return "Izin lokasi ditolak. Izinkan lokasi untuk situs ini pada pengaturan browser, lalu coba lagi.";
    case 2: return "Browser tidak berhasil mendapatkan posisi perangkat. Periksa Layanan lokasi Windows dan izin lokasi browser. Jika memakai browser dalam aplikasi, coba buka halaman ini di Chrome atau Edge.";
    case 3: return "Pengambilan lokasi melewati batas waktu. Periksa koneksi dan layanan lokasi perangkat, lalu coba lagi. Anda tetap bisa mengisi alamat secara manual.";
    default: return "Lokasi tidak dapat diambil dari browser ini. Coba Chrome atau Edge dengan izin lokasi aktif, atau isi alamat secara manual.";
  }
}
