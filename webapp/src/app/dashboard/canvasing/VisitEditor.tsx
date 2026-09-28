"use client";
import { useState, useRef, useEffect } from "react";
import { addManualVisit, updateVisit, displayAddress, displayCategory, type Visit } from "@/lib/canvasing";
import styles from "./page.module.css";
import { getDeviceLocation, locationErrorMessage } from "@/lib/device-location";

function PhotoPreview({ photo, onClose }: { photo: { src: string; number: number }; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={styles.photoDialog} aria-label={`Foto kunjungan ${photo.number}`} onCancel={e => { e.preventDefault(); e.stopPropagation(); onClose(); }}>
    <header><strong>Foto kunjungan {photo.number}</strong><button type="button" className="btn btn-secondary btn-sm" onClick={onClose} autoFocus>Tutup foto</button></header>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photo.src} alt={`Foto kunjungan ${photo.number}`} />
  </dialog>;
}

async function compressPhoto(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Gunakan foto JPG, PNG, atau WebP.');
  if (file.size > 15 * 1024 * 1024) throw new Error('Ukuran foto maksimal 15 MB.');
  const image = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
    canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Foto tidak dapat diproses.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .7);
    if (data.length > 650000) throw new Error('Foto terlalu besar setelah kompresi. Gunakan foto berukuran lebih kecil.');
    return data;
  } finally { image.close(); }
}

export default function VisitEditor({ store, listId, area, onClose, isNew = false, workspace = "agen" }: {
  store: Visit; listId: string; area: string; onClose: () => void; isNew?: boolean; workspace?: "agen" | "merchant";
}) {
  const [draft, setDraft] = useState<Visit>({ ...store, address: displayAddress(store.address), category: isNew || !store.category ? '' : displayCategory(store),
    visitArea: store.visitArea ?? area, agentStatus: store.agentStatus || 'unknown', qrisStatus: store.qrisStatus || 'unknown',
    qrisProviders: store.qrisProviders ?? (store.qrisProvider ? [store.qrisProvider] : []), edcStatus: store.edcStatus || 'unknown' });
  const [preview, setPreview] = useState<{ src: string; number: number } | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [locationMessage, setLocationMessage] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  function patch(values: Partial<Visit>) { setDraft(current => ({ ...current, ...values })); setDirty(true); setMessage(''); }
  function close() { if (busy || locating) return; if (!dirty || window.confirm('Ada perubahan yang belum disimpan. Tutup formulir?')) onClose(); }
  const text = (key: 'name' | 'category' | 'address' | 'phone' | 'pic' | 'visitArea', label: string) => <label>{label}<input maxLength={key === 'address' ? 1000 : 150} type={key === 'phone' ? 'tel' : 'text'} value={draft[key] || ''} onChange={event => patch({ [key]: event.target.value })} /></label>;
  async function locate() {
    if (!window.isSecureContext) { setLocationMessage('Lokasi memerlukan HTTPS atau localhost. Buka aplikasi melalui alamat yang aman, lalu coba lagi.'); return; }
    if (!navigator.geolocation) { setLocationMessage('Browser tidak mendukung lokasi.'); return; }
    setLocating(true); setLocationMessage('Mengambil posisi perangkat…');
    try {
      const position = await getDeviceLocation(navigator.geolocation, () => setLocationMessage('Lokasi akurat belum tersedia. Mencoba mode lokasi standar perangkat…'));
      const { latitude: lat, longitude: lng, accuracy } = position.coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Koordinat perangkat tidak valid.');
      patch({ lat, lng, locationAccuracy: accuracy, locationCapturedAt: new Date().toISOString() });
      setLocationMessage(`Koordinat tercatat, akurasi ±${Math.round(accuracy)} m. Mencari alamat…`);
      try {
        const response = await fetch(`/api/v1/reverse-geocode?lat=${lat}&lng=${lng}`, { signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok || !data.address) throw new Error();
        patch({ address: data.address });
        setLocationMessage(`Alamat terisi dari koordinat. Akurasi lokasi ±${Math.round(accuracy)} m. ${accuracy > 100 ? 'Lokasi masih berupa perkiraan luas; jangan anggap sebagai titik pasti toko. Periksa alamat atau coba lagi dari perangkat di lokasi toko.' : 'Periksa alamat sebelum menyimpan.'}`);
      } catch { setLocationMessage('Koordinat sudah tercatat, tetapi alamat gagal ditemukan. Isi alamat secara manual.'); }
    } catch (err) {
      setLocationMessage(locationErrorMessage(err));
    } finally { setLocating(false); }
  }
  return <dialog ref={node => { dialog.current = node; if (node && !node.open) node.showModal(); }} className={styles.visitDialog} onCancel={event => { event.preventDefault(); close(); }}>
    <header className={styles.formHeader}><div><span className={styles.eyebrow}>CANVASING / DATA KUNJUNGAN</span><h2>{isNew ? 'Tambah toko lapangan' : 'Catat kunjungan'}</h2><p>{isNew ? 'Catat usaha yang ditemukan saat canvasing.' : (store.name || "Toko belum diberi nama")}</p></div><button type="button" className="btn btn-secondary btn-sm" disabled={busy || locating} onClick={close}>Tutup</button></header>
    <form onSubmit={event => {
      event.preventDefault(); setMessage('');
      try {
        const qrisProviders = draft.qrisStatus === 'yes' ? (draft.qrisProviders || []).map(provider => provider.trim()).filter((provider, index, providers) => provider && providers.findIndex(other => other.toLowerCase() === provider.toLowerCase()) === index) : [];
        const saved = { ...draft, name: draft.name.trim(), address: draft.address.trim(), category: draft.category.trim(), visitArea: draft.visitArea?.trim(),
          agentProvider: draft.agentStatus === 'yes' ? draft.agentProvider?.trim() : '', qrisProviders, qrisProvider: qrisProviders[0] || '',
          ...(workspace === 'merchant' ? { edcProviders: draft.edcStatus === 'yes' ? (draft.edcProviders || []).map(bank => bank.trim()).filter((bank, index, banks) => bank && banks.findIndex(other => other.toLowerCase() === bank.toLowerCase()) === index) : [] } : {}) };
        if (isNew) { addManualVisit(listId, { ...saved, url: saved.locationCapturedAt ? `https://www.google.com/maps/search/?api=1&query=${saved.lat},${saved.lng}` : "" }); onClose(); }
        else { updateVisit(listId, store.visitId, saved); setDirty(false); setMessage('Seluruh data kunjungan berhasil disimpan.'); }
      } catch (err) { setMessage(err instanceof Error ? err.message : 'Gagal menyimpan.'); }
    }}>
      <div className={styles.formBody}>
        <fieldset><legend>01 · Identitas usaha</legend><div className={styles.fieldGrid}>{text('name', 'Nama toko')}{text('category', 'Kategori')}{text('pic', 'Nama PIC')}{text('phone', 'Nomor telepon')}{text('visitArea', 'Area kunjungan')}{text('address', 'Alamat')}</div></fieldset>
        <fieldset><legend>02 · Lokasi toko</legend><p>Alamat toko hasil pencarian sudah terisi. Untuk toko baru, ambil lokasi ketika berada di toko. Tombol ini mengirim koordinat ke OpenStreetMap untuk mencari alamat.</p><button type="button" className="btn btn-secondary" disabled={locating || busy} onClick={locate}>{locating ? 'Mengambil lokasi…' : 'Ambil lokasi saya & isi alamat'}</button><div className={styles.fieldGrid}><label>Latitude<input readOnly value={draft.lat || ''} /></label><label>Longitude<input readOnly value={draft.lng || ''} /></label></div>{locationMessage && <p role="status">{locationMessage}</p>}{draft.locationAccuracy != null && <small>Akurasi perangkat ±{Math.round(draft.locationAccuracy)} m</small>}</fieldset>
        <fieldset><legend>{workspace === "merchant" ? "03 · QRIS & EDC" : "03 · Agen & QRIS"}</legend><div className={styles.fieldGrid}>
          {workspace === "agen" && <label>Sudah menjadi agen?<select value={draft.agentStatus} onChange={e => patch({ agentStatus: e.target.value as Visit['agentStatus'] })}><option value="unknown">Belum diketahui</option><option value="yes">Sudah</option><option value="no">Belum</option></select></label>}
          {workspace === 'agen' && draft.agentStatus === 'yes' && <label>Penyedia agen<input list="agent-options" value={draft.agentProvider || ''} onChange={e => patch({ agentProvider: e.target.value })} placeholder="Pilih atau ketik penyedia lain" /><datalist id="agent-options">{['Agen46 BNI','BRILink','Mandiri Agen','BCA','Bank lain'].map(x => <option key={x} value={x} />)}</datalist></label>}
          <label>Sudah punya QRIS?<select value={draft.qrisStatus} onChange={e => patch({ qrisStatus: e.target.value as Visit['qrisStatus'] })}><option value="unknown">Belum diketahui</option><option value="yes">Sudah</option><option value="no">Belum</option></select></label>
          {draft.qrisStatus === 'yes' && <div className={styles.qrisProviders}>
            {(draft.qrisProviders?.length ? draft.qrisProviders : ['']).map((provider, index) => <div className={styles.edcRow} key={index}>
              <label>Penyedia QRIS {index + 1}<input list="qris-options" maxLength={150} value={provider} placeholder="Pilih atau ketik penyedia lain" onChange={e => { const providers = [...(draft.qrisProviders?.length ? draft.qrisProviders : [''])]; providers[index] = e.target.value; patch({ qrisProviders: providers }); }} /></label>
              <button type="button" className="btn btn-secondary btn-sm" aria-label={`Hapus penyedia QRIS ${index + 1}`} onClick={() => patch({ qrisProviders: draft.qrisProviders?.filter((_, i) => i !== index) })}>Hapus</button>
            </div>)}
            <datalist id="qris-options">{['BNI','BRI','Mandiri','BCA','CIMB Niaga','BSI','GoPay','OVO','DANA','ShopeePay'].map(x => <option key={x} value={x} />)}</datalist>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ qrisProviders: [...(draft.qrisProviders?.length ? draft.qrisProviders : ['']), ''] })}>Tambah penyedia QRIS</button>
          </div>}
          {workspace === 'merchant' && <label>Sudah punya EDC?<select value={draft.edcStatus} onChange={e => patch({ edcStatus: e.target.value as Visit['edcStatus'] })}><option value="unknown">Belum diketahui</option><option value="yes">Sudah</option><option value="no">Belum</option></select></label>}
        </div>
        {workspace === 'merchant' && draft.edcStatus === 'yes' && <div className={styles.edcBanks}>
          {(draft.edcProviders?.length ? draft.edcProviders : ['']).map((bank, index) => <div className={styles.edcRow} key={index}>
            <label>Bank EDC {index + 1}<input list="edc-options" maxLength={150} value={bank} placeholder="Pilih atau ketik nama bank" onChange={e => { const banks = [...(draft.edcProviders?.length ? draft.edcProviders : [''])]; banks[index] = e.target.value; patch({ edcProviders: banks }); }} /></label>
            <button type="button" className="btn btn-secondary btn-sm" aria-label={`Hapus bank EDC ${index + 1}`} onClick={() => patch({ edcProviders: draft.edcProviders?.filter((_, i) => i !== index) })}>Hapus</button>
          </div>)}
          <datalist id="edc-options">{['BCA', 'Mandiri', 'BNI', 'BRI', 'CIMB Niaga', 'Bank Danamon', 'Bank Mega', 'PermataBank', 'BSI'].map(bank => <option key={bank} value={bank} />)}</datalist>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ edcProviders: [...(draft.edcProviders?.length ? draft.edcProviders : ['']), ''] })}>Tambah bank EDC</button>
        </div>}</fieldset>
        <fieldset><legend>04 · Hasil kunjungan</legend><div className={styles.fieldGrid}>
          <label>Status kunjungan<select value={draft.status} onChange={e => patch({ status: e.target.value as Visit['status'] })}><option value="planned">Belum dikunjungi</option><option value="visited">Sudah dikunjungi</option></select></label>
          <label>Hasil prospek<input list="prospect-options" value={draft.prospectResult || ''} onChange={e => patch({ prospectResult: e.target.value })} placeholder="Pilih atau ketik hasil" /><datalist id="prospect-options">{['Belum ditindaklanjuti','Tertarik','Perlu pertimbangan','Tidak tertarik','Tidak memenuhi kriteria','Proses pendaftaran',workspace === 'merchant' ? 'Berhasil menjadi merchant' : 'Berhasil menjadi agen','PIC tidak ditemui'].map(x => <option key={x} value={x} />)}</datalist></label>
          <label>Tindak lanjut<input list="followup-options" value={draft.followUp || ''} onChange={e => patch({ followUp: e.target.value })} placeholder="Pilih atau ketik tindak lanjut" /><datalist id="followup-options">{['Kunjungan ulang','Hubungi via telepon / WhatsApp','Kirim informasi produk','Lengkapi dokumen','Pendampingan pendaftaran','Tidak ada tindak lanjut'].map(x => <option key={x} value={x} />)}</datalist></label>
        </div><label>Catatan<textarea rows={4} maxLength={5000} value={draft.notes} onChange={e => patch({ notes: e.target.value })} placeholder="Kondisi usaha, kebutuhan PIC, atau catatan tindak lanjut" /></label></fieldset>
        <fieldset><legend>05 · Foto kunjungan</legend><p>Maksimal 3 foto JPG, PNG, atau WebP. Foto dikompresi untuk penyimpanan browser.</p><label>Tambah foto kunjungan<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy || (draft.visitPhotos?.length || 0) >= 3} onChange={async e => {
          const files = Array.from(e.target.files || []); e.target.value = '';
          if (!files.length) return;
          if (files.length + (draft.visitPhotos?.length || 0) > 3) { setMessage('Maksimal 3 foto per kunjungan.'); return; }
          setBusy(true); setMessage('');
          try { const photos = await Promise.all(files.map(compressPhoto)); patch({ visitPhotos: [...(draft.visitPhotos || []), ...photos] }); }
          catch (err) { setMessage(err instanceof Error ? err.message : 'Foto gagal diproses.'); }
          finally { setBusy(false); }
        }} /></label><div className={styles.photos}>{draft.visitPhotos?.map((photo, index) => <div key={index}>
          <button type="button" className={styles.photoThumbnail} aria-label={`Buka foto kunjungan ${index + 1}`} onClick={() => setPreview({ src: photo, number: index + 1 })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt={`Foto kunjungan ${index + 1}`} />
          </button><button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ visitPhotos: draft.visitPhotos?.filter((_, i) => i !== index) })}>Hapus foto {index + 1}</button></div>)}</div></fieldset>
      </div>
      <footer className={styles.formFooter}>{message && <p role="status">{message}</p>}<small>Semua kolom opsional. Isi yang tersedia, lalu simpan kunjungan.</small><button type="submit" className="btn btn-primary" disabled={busy || locating}>{busy ? 'Memproses foto…' : isNew ? 'Simpan toko baru' : 'Simpan kunjungan'}</button></footer>
    </form>
    {preview && <PhotoPreview photo={preview} onClose={() => setPreview(null)} />}
  </dialog>;
}



