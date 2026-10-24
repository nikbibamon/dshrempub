# Tvijo DSHREM — daripada tugasan kepada hasil yang disemak

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo menyediakan ruang kerja pelayar, sambungan VS Code dan alat terminal di sekeliling aliran kerja pembangunan yang dikongsi. Huraikan tugasan, pilih hos pelaksanaan dan kebenarannya, periksa perubahan, dan simpan bukti yang digunakan untuk menerima hasilnya. Panduan ini memperkenalkan produk; README teknikal repositori dan rujukan arahan kekal sebagai sumber autoritatif untuk CLI.

## Mulakan dengan ruang kerja pilihan anda

Buka [DSHREM](https://dsh.tvijo.com/), dapatkan [sambungan VS Code dan arahan terminal](https://dsh.tvijo.com/download), atau baca [tetapan dijelaskan](https://dsh.tvijo.com/knowledge/settings-explained). Log masuk melalui aliran akaun yang disokong oleh perkhidmatan. Jangan sekali-kali tampal kunci API penyedia ke dalam prompt yang dikongsi, isu awam atau repositori.

CLI Node.js memerlukan Node 22 atau lebih baharu. Daripada checkout tempatan:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Arahan ini juga tersedia sebagai `dshrem`. CLI sembang jauh ini memaparkan alat yang dicadangkan tanpa melaksanakannya. Penyuntingan tempatan dan pelaksanaan arahan adalah milik VS Code Agent atau runtime hos yang dikonfigurasikan secara eksplisit; ia mempunyai kebenaran berasingan. Lihat [bantuan CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Fahami pilihan-pilihan

**Bukti dahulu** memisahkan fakta yang disokong daripada andaian. **Rancang dan semak** meminta pelan ringkas dan menyemak hasil terhadap permintaan. **Semak jawapan** mencabar draf; ia merupakan semakan kendiri melainkan penyemak berasingan ditetapkan secara eksplisit. Tiada satu pun kaedah ini menjamin ketepatan atau penggunaan token yang lebih rendah.

Pratetap tugasan menambah arahan dan senarai semak yang boleh diguna semula. Ia tidak mencipta memori model tambahan. Koleksi konteks yang lebih besar masih perlu mematuhi had permintaan perkhidmatan dan model. Laluan pengawal, Python dan state lanjutan merujuk kepada hos sambungan yang dipilih; dalam Remote SSH, iaitu pelayan jauh.

## Bekerja dengan pasukan apabila ia membantu

Pasukan AGENTROY memberikan tanggungjawab berbeza kepada penyelaras, pelaksana dan penyemak. Dasar hos mungkin meminta DSHREM ds41f dan alat Codex atau Claude berasaskan akaun, dengan semakan seni bina pilihan. Ketersediaan bergantung pada runtime yang dipasang, akses akaun dan dasar yang dipilih. Langganan yang tiada tidak boleh bertukar secara senyap menjadi panggilan API berbayar.

Tiga hingga enam peranan ialah pilihan organisasi, bukan formula kualiti. Penyemak memerlukan versi artifak yang tepat dan bukti ujian. Semakan yang gagal secara serius menghalang penerimaan walaupun model bersetuju. Baca [pasukan agen dan kos yang kelihatan](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Sambung semula tanpa menyembunyikan ketidakpastian

Sesi tmux sebelah pelayan yang terpisah boleh diteruskan selepas komputer riba atau telefon terputus. Kerja pada komputer tempatan yang dimatikan tidak boleh. Kegagalan pelayan, tekanan memori dan kehilangan storan masih memerlukan pemulihan. Sambung semula ke ID tugasan yang disimpan dan periksa peristiwa terakhirnya yang disahkan sebelum memulakan lebih banyak kerja. Jangan ulang secara membuta tuli permintaan boleh bil yang hasilnya tidak diketahui. Lihat [terputus dan pemulihan](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Kekalkan kos dan data kelihatan

Semak sebut harga yang diterima, had tugasan, amaun yang ditempah dan resit penggunaan. Penanda aras perkhidmatan 8% akan menjadikan USD1.00 penggunaan penyedia menjadi USD1.08 sebelum caj yang didedahkan secara berasingan; ini hanyalah contoh, bukan tawaran harga. Kuota langganan, caj penyedia dan sumber pelayan ialah had yang berbeza. Bajet tambahan memerlukan pilihan yang eksplisit.

Fail kelayakan CLI tempatan menggunakan kebenaran pemilik sahaja. Kebenaran ini bukan penyulitan atau sandaran. Muat naik pengetahuan adalah eksplisit; fail peribadi tidak sepatutnya masuk ke pautan serahan awam. [Serahan prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) menerangkan cara menyalin tugasan yang telah disemak ke alat lain.

Pakej repositori ini pada masa ini ditanda `UNLICENSED`; penerbitan tidak memberikan hak penggunaan semula. Rujuk metadata pakej semasa dan notis pelesenan sebelum pengedaran semula. Terjemahan ialah panduan pengenalan, dijana dengan DSHREM dan disemak untuk konsistensi struktur; bahasa Inggeris ialah rujukan bagi percanggahan teknikal.
