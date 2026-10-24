# Tvijo DSHREM — dari sebuah tugas menjadi hasil yang diperiksa

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo menyatukan ruang kerja peramban, ekstensi VS Code, dan alat terminal dalam satu alur kerja pengembangan bersama. Jelaskan tugasnya, pilih host eksekusi dan izinnya, periksa perubahannya, dan simpan bukti yang digunakan untuk menerima hasilnya. Panduan ini memperkenalkan produk; README teknis repositori dan referensi perintah tetap menjadi acuan resmi untuk CLI.

## Mulai dengan ruang kerja pilihan Anda

Buka [DSHREM](https://dsh.tvijo.com/), dapatkan [ekstensi VS Code dan petunjuk terminal](https://dsh.tvijo.com/download), atau baca [penjelasan pengaturan](https://dsh.tvijo.com/knowledge/settings-explained). Masuk melalui alur akun yang didukung layanan. Jangan pernah menempelkan kunci API penyedia ke dalam prompt bersama, issue publik, atau repositori.

CLI Node.js memerlukan Node 22 atau lebih baru. Dari checkout lokal:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Perintah ini juga tersedia sebagai `dshrem`. CLI chat jarak jauh ini menampilkan alat yang disarankan tanpa menjalankannya. Pengeditan lokal dan eksekusi perintah menjadi tanggung jawab VS Code Agent atau runtime host yang dikonfigurasi secara eksplisit; keduanya memiliki izin terpisah. Lihat [bantuan CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Pahami pilihannya

**Bukti lebih dulu** memisahkan fakta yang didukung dari asumsi. **Rencana dan periksa** meminta rencana singkat dan memeriksa hasilnya terhadap permintaan. **Tinjau jawaban** menantang draf; ini adalah peninjauan mandiri kecuali peninjau terpisah ditetapkan secara eksplisit. Tidak satu pun dari metode ini menjamin kebenaran atau penggunaan token yang lebih rendah.

Preset tugas menambahkan instruksi dan daftar periksa yang dapat digunakan ulang. Preset tidak menciptakan memori model tambahan. Koleksi konteks yang lebih besar tetap harus muat dalam batas permintaan layanan dan model. Jalur lanjutan untuk controller, Python, dan state merujuk pada host ekstensi yang dipilih; dalam Remote SSH, itu adalah server jarak jauh.

## Bekerja dalam tim bila itu membantu

Tim AGENTROY menetapkan tanggung jawab yang berbeda bagi koordinator, pelaksana, dan peninjau. Kebijakan host dapat meminta DSHREM ds41f serta alat Codex atau Claude berbasis akun, dengan peninjauan arsitektural opsional. Ketersediaan bergantung pada runtime yang terpasang, akses akun, dan kebijakan yang dipilih. Langganan yang tidak ada tidak boleh diam-diam berubah menjadi panggilan API berbayar.

Tiga hingga enam peran adalah pilihan organisasi, bukan rumus kualitas. Peninjau memerlukan versi artefak yang tepat dan bukti pengujian. Pemeriksaan gagal yang serius memblokir penerimaan meskipun model sepakat. Baca [tim agen dan biaya yang terlihat](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Lanjutkan tanpa menyembunyikan ketidakpastian

Sesi tmux sisi server yang terlepas dapat berlanjut setelah laptop atau ponsel terputus. Pekerjaan pada komputer lokal yang dimatikan tidak dapat berlanjut. Kegagalan server, tekanan memori, dan kehilangan penyimpanan tetap memerlukan pemulihan. Sambungkan kembali ke ID tugas yang tersimpan dan periksa peristiwa terakhir yang terkonfirmasi sebelum memulai pekerjaan lebih lanjut. Jangan mengulang secara buta permintaan berbayar yang hasilnya tidak diketahui. Lihat [pemutusan koneksi dan pemulihan](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Jaga biaya dan data tetap terlihat

Tinjau penawaran yang diterima, batas tugas, jumlah yang dicadangkan, dan tanda terima penggunaan. Markup layanan 8% akan mengubah USD1.00 penggunaan penyedia menjadi USD1.08 sebelum biaya yang diungkapkan secara terpisah; ini adalah contoh, bukan penawaran harga. Kuota langganan, biaya penyedia, dan sumber daya server adalah batas yang berbeda. Anggaran tambahan memerlukan pilihan eksplisit.

Berkas kredensial CLI lokal menggunakan izin khusus pemilik. Izin ini bukan enkripsi atau cadangan. Unggahan pengetahuan bersifat eksplisit; berkas privat tidak boleh pernah masuk ke tautan serah terima publik. [Serah terima prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) menjelaskan cara menyalin tugas yang telah ditinjau ke alat lain.

Paket repositori ini saat ini ditandai `UNLICENSED`; publikasi tidak memberikan hak penggunaan ulang. Periksa metadata paket dan pemberitahuan lisensi yang berlaku sebelum mendistribusikan ulang. Terjemahan adalah panduan pengantar, dihasilkan dengan DSHREM dan diperiksa untuk konsistensi struktural; bahasa Inggris adalah acuan untuk perbedaan teknis.
