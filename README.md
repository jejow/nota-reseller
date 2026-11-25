# Nota Reseller

Panel JUU untuk membuat invoice, mencatat klaim garansi, dan memantau laba reseller. Tampilan menyesuaikan layar HP dan desktop.

## Sinkronisasi antar perangkat

Buka [Nota Reseller di GitHub Pages](https://jejow.github.io/nota-reseller/) lalu pilih **Hubungkan GitHub**. Buat token Fine-grained di GitHub untuk repo privat `jejow/nota-reseller-data` dengan izin **Contents: Read and write**. Masukkan token dan kata sandi sinkronisasi minimal 12 karakter di aplikasi. Gunakan kata sandi yang sama di setiap perangkat. Simpan kata sandinya agar pembukuan terenkripsi dapat dibuka kembali.

Invoice, klaim, pengeluaran, harga paket, dan template disimpan sebagai pembukuan terenkripsi di repo privat. Data lokal yang sudah ada digabung berdasarkan ID dan waktu perubahan. Aplikasi menyimpan perubahan saat tombol simpan digunakan dan mengambil perubahan perangkat lain ketika tab dibuka atau secara berkala. Gunakan **Sinkronkan sekarang** untuk memperbarui tampilan segera. Jika token kedaluwarsa, pilih **Pengaturan → Ganti token GitHub** dan pakai kata sandi yang sama.

## Mulai memakai

Pembukuan baru dimulai dari Rp0. Hubungkan GitHub untuk menggunakan satu pembukuan dari beberapa perangkat.

1. Buka **Pengaturan** untuk melengkapi identitas toko, instruksi pembayaran, panduan akses, dan biaya modal default. Harga awal **Garansi 3 Hari Rp80.000** dan **Full Garansi Rp120.000** per akun.
2. Buka **Buat invoice**. Unggah satu order atau tempel data akun. Status awal invoice baru adalah **Lunas** dan tanggal pembayaran mengikuti tanggal invoice sampai diubah manual. Pilih **Menunggu** jika pelanggan belum membayar.
3. Pilih **Simpan invoice** untuk mencatat transaksi dan mengunci nomor invoice. Gunakan **Salin pesan**, **TXT**, atau **Cetak / PDF** untuk menyimpan pesan pelanggan dalam format yang Anda butuhkan.
4. Gunakan **Klaim garansi** untuk menghubungkan invoice tersimpan atau memasukkan nomor invoice lama. Isi keluhan, status, dan biaya jika ada. Unggah akun pengganti dengan cara yang sama, lalu salin pesan klaim.

## Format impor

- TXT atau teks tempel dengan format satu akun per baris, seperti `email@contoh.test|sandi|2FA`. Format bertanda titik dua, empat tanda hubung, dan baris berlabel juga terbaca. Tautan 2FA yang memuat kunci dapat diurai menjadi **2FA Key**. Tautan OTP email tampil pada kolom tersendiri.
- Laporan supplier dengan label seperti `Order code`, `Product`, `Quantity`, `Amount`, dan `Attached data`. Nominal mata uang asing tampil sebagai referensi. Masukkan ekuivalen rupiah di **Modal per akun**.
- Laporan AIS dan ganti email bisa mencantumkan tautan terpisah seperti `email@contoh.test----https://contoh.test/verifikasi`. Alamat di awal baris mengaitkan tautan dengan akun yang sesuai.
- CSV dan TSV memakai header, misalnya `email,password,2fa,verification`. JSON menerima satu objek, array akun, atau objek dengan properti `accounts`.
- PDF harus memiliki teks yang bisa diseleksi. Batas impor 8 MB dan 50 halaman untuk PDF. Gunakan satu order per impor, dengan satu atau beberapa akun.
- Jika format belum dikenali, isi **Detail akun manual** atau edit **Catatan untuk pelanggan**. Perintah curl dan kunci API di luar kolom akun dilewati.

## Template dan garansi

**Pengaturan → Template pesan** memiliki tab Invoice dan Klaim garansi. Klik variabel seperti `{{nomor}}` dan `{{bagian_akun}}` untuk memasukkannya ke template. **Edit pesan ini** berlaku untuk pesan yang sedang dibuka.

Invoice baru memakai tanggal hari ini menurut WIB. Di **Mode tanggal invoice**, pilih **Manual** untuk memilih tanggal sendiri. Jika file memuat tanggal supplier, gunakan **Gunakan tanggal supplier** untuk mengisinya.

Nomor invoice awal mengikuti format `JUU-YYMMDD-053`, dengan tanggal sesuai pilihan saat pertama disimpan. Garansi 3 Hari berakhir tiga hari setelah tanggal pembayaran. Full Garansi mengikuti masa aktif paket, dengan opsi menetapkan tanggal akhir di invoice atau durasi default di Pengaturan.

Pratinjau invoice menyertakan masa berlaku paket dan petunjuk klaim. Ubah teks standar di **Pengaturan → Ketentuan garansi**. Pada template kustom, letakkan `{{ketentuan}}` di posisi yang diinginkan. Ketentuan disisipkan otomatis jika variabel itu belum ada.

## Cara laporan menghitung laba

- Omzet bersih = harga jual × jumlah − diskon − refund.
- Laba kotor = omzet bersih − modal supplier.
- Laba bersih = laba kotor − biaya transaksi − pengeluaran operasional − biaya klaim + kredit supplier.
- Penjualan dan modal masuk laporan pada tanggal pembayaran. Refund, pengeluaran, biaya klaim, dan kredit supplier memakai tanggalnya masing-masing. Invoice menunggu pembayaran tampil sebagai piutang.
- Laba bersifat sementara selama masih ada invoice lunas tanpa modal. Isi `0` hanya jika modal akun memang nol. Laba per paket mencakup biaya langsung paket. Pengeluaran umum masuk laba bersih usaha.

## Cadangan dan penyimpanan

GitHub Pages bisa menyimpan di browser atau menyinkronkan pembukuan ke repo privat setelah dihubungkan. Gunakan **Pengaturan → Unduh backup** untuk membuat salinan. Impor menggabungkan transaksi berdasarkan ID internal dan mengambil versi terbaru dari transaksi yang sama.

Kata sandi, 2FA, tautan verifikasi, dan draf pesan hanya ada selama sesi halaman. Simpan TXT atau salin pesan ketika perlu menyimpan hasil untuk dikirim. File order dan teks diproses di browser.

## GitHub Pages

[Buka Nota Reseller](https://jejow.github.io/nota-reseller/)

Situs dipublikasikan dari folder `docs` pada branch `main`. Pilih **Hubungkan GitHub** dari halaman utama untuk menyiapkan sinkronisasi di halaman tersebut.

## Menjalankan sumber secara lokal

Dengan Node.js 18 atau lebih baru, klik ganda **Buka Nota Reseller.cmd** di Windows atau jalankan `node serve.mjs`. Buka [alamat lokal](http://127.0.0.1:4173/).

Untuk pratinjau melalui Wi-Fi yang sama, jalankan `node serve.mjs --lan` dan buka alamat Wi-Fi/LAN yang dicetak di terminal. Gunakan jaringan yang Anda percaya.

Jalankan `node --test` di direktori ini untuk menguji pengenalan format, perhitungan laba, dan cadangan.
