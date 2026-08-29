# 🚀 Dockermon — Future Development & Feature Roadmap

Dokumen ini berisi panduan dan ide rekomendasi pengembangan fitur lanjutan untuk **Dockermon** di masa mendatang. Dokumen ini dapat digunakan sebagai acuan *roadmap* teknis saat ingin menambahkan kapabilitas baru.

---

## 📌 Phase 1: Operational & Core Management (Operasional & Manajemen)

### 1.1 Web-Based Interactive Terminal (Container Exec)
- **Deskripsi**: Menyediakan akses terminal shell (`bash` / `sh`) interaktif langsung dari browser untuk container tertentu.
- **Teknologi**: `xterm.js` di frontend + WebSocket (`ws`) di backend dengan `docker.exec()`.
- **Manfaat**: Admin dapat melakukan *quick debugging* atau mengeksekusi perintah di dalam container tanpa perlu SSH ke server host.

### 1.2 Log Export & Download
- **Deskripsi**: Menambahkan opsi untuk mengunduh log container.
- **Format**: File `.log`, `.txt`, atau `.json`.
- **Fitur**: Pilihan filter berdasarkan rentang waktu atau jumlah baris (*tail*).

### 1.3 Container Health Check Inspector
- **Deskripsi**: Menampilkan status *Healthcheck* bawaan Docker (`healthy`, `unhealthy`, `starting`).
- **Integrasi**: Menambahkan badge status healthcheck di tabel container dan halaman detail.

---

## 📌 Phase 2: Alerting & Notification System (Notifikasi & Peringatan)

### 2.1 Threshold & Anomaly Alerts
- **Deskripsi**: Memicu peringatan otomatis jika penggunaan resource menembus ambang batas.
- **Kriteria**: Misal CPU > 85% atau Memory > 90% selama 2 menit berturut-turut.

### 2.2 Multi-Channel Webhook Notifications
- **Deskripsi**: Mengirim notifikasi otomatis saat container mengalami event kritis (`CRASH`, `EXITED`, `UNHEALTHY`).
- **Integrasi Channel**:
  - Telegram Bot Webhook
  - Discord Webhook
  - Slack Webhook
  - Custom HTTP Webhook

---

## 📌 Phase 3: Security & Auditing (Keamanan & Audit)

### 3.1 Security & Open Port Audit
- **Deskripsi**: Panel khusus yang memetakan seluruh port host yang terekspos ke publik (`0.0.0.0:port`).
- **Manfaat**: Mencegah kebocoran akses port sensitif (seperti MySQL `3306`, Redis `6379`, MongoDB `27017`) ke internet umum.

### 3.2 Vulnerability Scanning (Image CVE Audit)
- **Deskripsi**: Memeriksa *base image* container dari celah keamanan (*Common Vulnerabilities and Exposures*).
- **Integrasi**: Integrasi dengan API Trivy atau Docker Engine Security Scan.

### 3.3 Admin Action Audit Trail
- **Deskripsi**: Mencatat log aktivitas manajemen internal dashboard.
- **Data yang Dicatat**: Username admin, jenis aksi (`START`, `STOP`, `RESTART`, `PAUSE`), waktu, ID container, dan IP address pengakses.

---

## 📌 Phase 4: Engine Cleanup & Stack Management (Perawatan Host & Docker)

### 4.1 System Prune & Cleanup Tool
- **Deskripsi**: Tombol utilitas untuk membersihkan resource Docker yang tidak terpakai.
- **Item**: *Dangling Images*, *Stopped Containers*, *Unused Networks*, dan *Build Cache* (`docker system prune`).

### 4.2 Docker Compose & Stack Visualizer
- **Deskripsi**: Menampilkan grup container berdasarkan Docker Compose Project (`com.docker.compose.project`).
- **Fitur**: Tombol aksi *One-Click Restart Stack* untuk me-restart seluruh layanan terkait sekaligus.

### 4.3 Volume & Disk Usage Inspector
- **Deskripsi**: Menampilkan daftar Docker Volume, ukuran penggunaan disk, serta container mana saja yang terhubung ke volume tersebut.

---

## 📌 Phase 5: Persistence & Historical Analytics (Analisis Data Historis)

### 5.1 Persistent Metrics Storage
- **Deskripsi**: Menyimpan data history metrik (CPU, Memory, Network) secara permanen ke database ringan.
- **Teknologi**: SQLite / TimescaleDB / InfluxDB.
- **Rentang Simpan**: 7 hari, 30 hari, hingga 90 hari.

### 5.2 Performance & Uptime PDF/CSV Report
- **Deskripsi**: Fitur *generate report* performa berkala.
- **Metrik**: Rata-rata beban CPU, peak memory, total bandwidth terpakai, dan persentase *Uptime* container.

---

## 📌 Phase 6: Multi-Node & Automation (Skalabilitas & Otomatisasi)

### 6.1 Multi-Host / Multi-Server Monitoring
- **Deskripsi**: Memantau beberapa server Docker terpisah dari 1 dashboard utama Dockermon.
- **Arsitektur**: Agent Dockerode remote atau agent SSH ringan pada host target.

### 6.2 Scheduled Maintenance Jobs
- **Deskripsi**: Penjadwalan restart otomatis atau pembersihan otomatis pada jam-jam sepi (*maintenance window*).

### 6.3 Auto-Update Image Detector (Watchtower Integration)
- **Deskripsi**: Mendeteksi jika ada *tag image* terbaru di registry (Docker Hub / GHCR) dan memberikan opsi *One-Click Update*.

---

## 📌 Phase 7: UI & Aesthetic Enhancements (Tampilan & Pengalaman Pengguna)

### 7.1 CRT Color Palette Switcher
- **Deskripsi**: Pilihan tema warna terminal retro opsional:
  - 🟢 **Phosphor Green** (Default NOC)
  - 🟠 **Amber CRT** (Warna oranye klasik IBM/DEC)
  - 🔵 **Cyber Cyan** (Tema biru neon cyberpunk)
  - ⚪ **Paper White** (Monochrome VT100)

### 7.2 Full Screen Kiosk / NOC Display Mode
- **Deskripsi**: Mode tampilan penuh tanpa navigasi sidebar/topbar, dioptimalkan untuk dipasang di monitor TV / NOC Display Wall.

### 7.3 Optional Audio Alerts & Effects
- **Deskripsi**: Efek suara retro (bisa di-mute) saat tombol diklik atau saat terjadi alarm event kritis.

---

## 🛠️ Ringkasan Urutan Prioritas Implementasi yang Disarankan:
1. **Fitur Cepat (Quick Wins)**: *Log Export/Download*, *System Prune Tool*, *CRT Color Switcher*.
2. **Fitur Tingkat Lanjut**: *Web Terminal (Exec)*, *Webhook Notifications (Telegram/Discord)*, *Volume Inspector*.
3. **Fitur Skala Besar**: *Persistent History Storage*, *Multi-Host Support*, *Security/CVE Scanner*.
