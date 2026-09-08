# PRD: Sistem Absensi & Akuntabilitas Tugas Panitia PMB

## 1. Latar Belakang & Masalah

Meja pendaftaran mahasiswa baru (PMB) dijaga bergantian oleh sekitar 10 mahasiswa (2-3 orang per hari, berganti tiap hari). Saat ini:
- Tidak ada sistem absensi untuk panitia yang jaga.
- Dosen memberi tugas langsung ke siapapun yang sedang jaga hari itu.
- Karena tidak ada serah-terima yang jelas, tugas dari dosen sering "kececer" — panitia hari berikutnya tidak tahu ada tugas yang belum dilaporkan/diselesaikan oleh tim sebelumnya.

## 2. Tujuan

1. Mencatat kehadiran panitia secara akurat, sulit dicurangi (tidak bisa absen dari luar lokasi).
2. Memberi dosen jalur langsung untuk menugaskan pekerjaan ke tim yang sedang jaga.
3. Memastikan tugas tidak hilang saat pergantian shift — ada jejak jelas siapa mengerjakan apa, dan apa yang belum selesai.

## 3. Pengguna & Peran

| Peran | Deskripsi | Hak Akses |
|---|---|---|
| **Dosen/Admin** | Pemberi tugas, pemantau | Membuat tugas, melihat semua laporan & riwayat absensi |
| **Panitia** | Mahasiswa yang jaga bergantian | Scan absen, melihat & memperbarui status tugas, menulis catatan serah-terima |

Total pengguna: >10 orang (termasuk dosen dan panitia inti).

## 4. Fitur per Fase

### Fase 1 — Login & Role (MVP awal)
- Autentikasi menggunakan Supabase Auth (email + password).
- Dua role: `dosen` dan `panitia`, disimpan di tabel `profiles`.
- Setelah login, tampilan dashboard berbeda sesuai role.

### Fase 2 — Presensi QR Dinamis
- Halaman `/kiosk` tanpa login, menampilkan QR besar yang berganti otomatis tiap 60 detik (dihitung dari timestamp + secret key, mirip OTP).
- Panitia scan QR dari HP masing-masing (lewat browser, tanpa app tambahan) untuk mencatat kehadiran (nama, waktu, status tepat waktu/terlambat).
- Kode kedaluwarsa ditolak sistem — mencegah screenshot/foto dipakai dari jarak jauh.

### Fase 3 — Dashboard Tugas dari Dosen
- Dosen membuat tugas (judul, deskripsi, deadline opsional). Tugas otomatis terlihat oleh SEMUA panitia yang sedang login, bukan individu tertentu.
- Panitia memperbarui status tugas: `Belum Dikerjakan` / `Diproses` / `Selesai`, disertai catatan singkat.

### Fase 4 — Riwayat & Akuntabilitas
- Log riwayat absensi (siapa, kapan, tepat waktu/terlambat).
- Log riwayat tugas: siapa mengubah status, kapan, isi catatannya.
- Dosen bisa melihat dengan jelas jika ada tugas yang tidak dilanjutkan oleh shift berikutnya.

## 5. Non-Fungsional / Pertimbangan Teknis

- **Stack**: React + Vite (frontend), Supabase (auth + database + realtime).
- **Ketahanan koneksi**: kode QR dihitung berbasis waktu (client-side), sehingga tampilan QR tetap jalan meski koneksi internet di lokasi sempat lambat; hanya proses submit absen yang butuh koneksi aktif.
- **Keamanan data**: Row Level Security di Supabase — panitia hanya bisa mengubah data miliknya sendiri, dosen punya akses baca penuh.

## 6. Di Luar Cakupan (Untuk Sekarang)

- Notifikasi push/WhatsApp otomatis.
- Laporan/analitik statistik kehadiran jangka panjang.
- Aplikasi mobile native (cukup web, diakses lewat browser HP).

## 7. Status

- [ ] Fase 1: Login & Role
- [ ] Fase 2: Presensi QR Dinamis
- [ ] Fase 3: Dashboard Tugas dari Dosen
- [ ] Fase 4: Riwayat & Akuntabilitas
