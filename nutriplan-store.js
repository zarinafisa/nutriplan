/**
 * NutriPlan Store — Shared localStorage CRUD layer
 * Semua halaman import script ini untuk data yang terintegrasi.
 *
 * STRUKTUR DATA:
 *  nutriplan_user       → { name, email, avatar, joinDate }
 *  nutriplan_profile    → { gender, usia, beratBadan, tinggiBadan, aktivitas, tujuan }
 *  nutriplan_prefs      → { budget, durasi, kaloriTarget, pantangan[], gaya[], jadwal }
 *  nutriplan_mealplans  → [ { id, nama, createdAt, status, kalori, budget, hari[] } ]
 *  nutriplan_active_plan→ id string (plan aktif sekarang)
 *  nutriplan_log        → [ { id, tanggal, mealPlanId, mealType, nama, kalori, eaten } ]
 */

const NutriStore = (() => {

  // ─── HELPERS ────────────────────────────────────────────────────────────────
  const get = (key) => {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  };
  const set = (key, val) => localStorage.setItem(key, JSON.stringify(val));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const today = () => new Date().toISOString().split('T')[0];

  // ─── SEED DEFAULT DATA (jika belum ada) ────────────────────────────────────
  function initDefaults() {
    if (!get('nutriplan_user')) {
      set('nutriplan_user', {
        name: 'Pengguna Baru',
        email: '',
        avatar: 'https://ui-avatars.com/api/?name=P&background=3a6b35&color=b9f1ad&bold=true',
        joinDate: today()
      });
    }
    if (!get('nutriplan_profile')) {
      set('nutriplan_profile', {
        gender: 'pria', usia: 22,
        beratBadan: 65, tinggiBadan: 170,
        aktivitas: 'sedang', tujuan: 'sehat'
      });
    }
    if (!get('nutriplan_prefs')) {
      set('nutriplan_prefs', {
        budget: 500000, durasi: 7,
        kaloriTarget: 2000,
        pantangan: [], gaya: [],
        jadwal: { sarapan: true, makan_siang: true, makan_malam: true, snack: false }
      });
    }
    if (!get('nutriplan_mealplans')) {
      set('nutriplan_mealplans', []);
    }
    if (!get('nutriplan_log')) {
      set('nutriplan_log', []);
    }
  }

  // ─── USER ────────────────────────────────────────────────────────────────────
  const User = {
    get: () => get('nutriplan_user') || {},
    set: (data) => {
      const cur = User.get();
      const updated = { ...cur, ...data };
      // Update avatar otomatis jika nama berubah
      if (data.name && !data.avatar) {
        const initials = data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
        updated.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=3a6b35&color=b9f1ad&bold=true`;
      }
      set('nutriplan_user', updated);
      return updated;
    },
    isLoggedIn: () => {
      const u = get('nutriplan_user');
      return u && u.email && u.email.length > 0;
    },
    login: (email, name) => {
      const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
      const u = {
        name, email,
        avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=3a6b35&color=b9f1ad&bold=true`,
        joinDate: today()
      };
      set('nutriplan_user', u);
      return u;
    },
    logout: () => {
      // Hapus session tapi pertahankan data
      const u = User.get();
      u.email = '';
      set('nutriplan_user', u);
    }
  };

  // ─── PROFILE ────────────────────────────────────────────────────────────────
  const Profile = {
    get: () => get('nutriplan_profile') || {},
    save: (data) => {
      const cur = Profile.get();
      const updated = { ...cur, ...data };
      set('nutriplan_profile', updated);
      return updated;
    },
    // Hitung BMR & kebutuhan kalori otomatis
    hitungKalori: () => {
      const p = Profile.get();
      if (!p.beratBadan || !p.tinggiBadan || !p.usia) return 2000;
      let bmr = p.gender === 'pria'
        ? 10 * p.beratBadan + 6.25 * p.tinggiBadan - 5 * p.usia + 5
        : 10 * p.beratBadan + 6.25 * p.tinggiBadan - 5 * p.usia - 161;
      const faktor = { sedentari: 1.2, ringan: 1.375, sedang: 1.55, berat: 1.725, sangat_berat: 1.9 };
      const f = faktor[p.aktivitas] || 1.55;
      let total = Math.round(bmr * f);
      if (p.tujuan === 'turun') total -= 500;
      if (p.tujuan === 'naik') total += 300;
      return total;
    }
  };

  // ─── PREFERENSI ─────────────────────────────────────────────────────────────
  const Prefs = {
    get: () => get('nutriplan_prefs') || {},
    save: (data) => {
      const cur = Prefs.get();
      const updated = { ...cur, ...data };
      set('nutriplan_prefs', updated);
      return updated;
    }
  };

  // ─── MEAL PLANS — CRUD LENGKAP ───────────────────────────────────────────────
  const Plans = {
    getAll: () => get('nutriplan_mealplans') || [],

    getById: (id) => Plans.getAll().find(p => p.id === id) || null,

    getActive: () => {
      const activeId = get('nutriplan_active_plan');
      if (activeId) return Plans.getById(activeId);
      // Fallback: plan pertama berstatus aktif
      return Plans.getAll().find(p => p.status === 'aktif') || null;
    },

    // CREATE
    create: (data) => {
      const plans = Plans.getAll();
      const newPlan = {
        id: uid(),
        nama: data.nama || 'Rencana Makan',
        createdAt: today(),
        status: 'aktif',
        kalori: data.kalori || 2000,
        budget: data.budget || 500000,
        durasi: data.durasi || 7,
        pantangan: data.pantangan || [],
        gaya: data.gaya || [],
        hari: data.hari || _generateDummyHari(data.kalori || 2000, data.durasi || 7)
      };
      // Nonaktifkan plan lama
      plans.forEach(p => { if (p.status === 'aktif') p.status = 'selesai'; });
      plans.unshift(newPlan);
      set('nutriplan_mealplans', plans);
      set('nutriplan_active_plan', newPlan.id);
      return newPlan;
    },

    // UPDATE
    update: (id, data) => {
      const plans = Plans.getAll();
      const idx = plans.findIndex(p => p.id === id);
      if (idx === -1) return null;
      plans[idx] = { ...plans[idx], ...data, id };
      set('nutriplan_mealplans', plans);
      return plans[idx];
    },

    // DELETE
    delete: (id) => {
      let plans = Plans.getAll();
      plans = plans.filter(p => p.id !== id);
      set('nutriplan_mealplans', plans);
      // Reset active jika yang dihapus adalah active
      if (get('nutriplan_active_plan') === id) {
        const next = plans.find(p => p.status === 'aktif');
        set('nutriplan_active_plan', next ? next.id : null);
      }
      return true;
    },

    setActive: (id) => {
      set('nutriplan_active_plan', id);
    }
  };

  // ─── LOG MAKAN — CRUD ────────────────────────────────────────────────────────
  const Log = {
    getAll: () => get('nutriplan_log') || [],

    getByDate: (date) => Log.getAll().filter(l => l.tanggal === date),

    getToday: () => Log.getByDate(today()),

    getTodayKalori: () => Log.getToday().filter(l => l.eaten).reduce((s, l) => s + (l.kalori || 0), 0),

    // CREATE
    add: (entry) => {
      const log = Log.getAll();
      const newEntry = {
        id: uid(),
        tanggal: today(),
        ...entry,
        eaten: entry.eaten !== undefined ? entry.eaten : false
      };
      log.push(newEntry);
      set('nutriplan_log', log);
      return newEntry;
    },

    // UPDATE (toggle eaten)
    toggleEaten: (id) => {
      const log = Log.getAll();
      const idx = log.findIndex(l => l.id === id);
      if (idx === -1) return null;
      log[idx].eaten = !log[idx].eaten;
      set('nutriplan_log', log);
      return log[idx];
    },

    // DELETE
    delete: (id) => {
      let log = Log.getAll();
      log = log.filter(l => l.id !== id);
      set('nutriplan_log', log);
      return true;
    },

    // Stats minggu ini
    getWeekStats: () => {
      const log = Log.getAll();
      const result = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayLog = log.filter(l => l.tanggal === dateStr && l.eaten);
        result.push({
          date: dateStr,
          hari: ['Min','Sen','Sel','Rab','Kam','Jum','Sab'][d.getDay()],
          kalori: dayLog.reduce((s, l) => s + (l.kalori || 0), 0)
        });
      }
      return result;
    }
  };

  // ─── GENERATOR DUMMY HARI (untuk demo) ──────────────────────────────────────
  const MENU_POOL = [
    { nama: 'Nasi Uduk + Telur Balado', kalori: 480, harga: 15000, tipe: 'sarapan' },
    { nama: 'Bubur Ayam Spesial', kalori: 350, harga: 12000, tipe: 'sarapan' },
    { nama: 'Roti Gandum + Alpukat', kalori: 320, harga: 18000, tipe: 'sarapan' },
    { nama: 'Oatmeal Buah Segar', kalori: 280, harga: 14000, tipe: 'sarapan' },
    { nama: 'Nasi Ayam Bakar + Lalapan', kalori: 560, harga: 22000, tipe: 'makan_siang' },
    { nama: 'Gado-Gado Istimewa', kalori: 450, harga: 18000, tipe: 'makan_siang' },
    { nama: 'Soto Ayam + Nasi', kalori: 510, harga: 19000, tipe: 'makan_siang' },
    { nama: 'Pecel Sayur + Tempe', kalori: 380, harga: 13000, tipe: 'makan_siang' },
    { nama: 'Tumis Kangkung + Ikan Gurame', kalori: 490, harga: 28000, tipe: 'makan_malam' },
    { nama: 'Sup Tofu + Sayuran', kalori: 320, harga: 16000, tipe: 'makan_malam' },
    { nama: 'Ayam Panggang + Kentang', kalori: 620, harga: 32000, tipe: 'makan_malam' },
    { nama: 'Ikan Bakar Bumbu Bali', kalori: 540, harga: 35000, tipe: 'makan_malam' },
  ];

  function _generateDummyHari(targetKalori, durasi) {
    const hari = [];
    const namaHari = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
    for (let d = 0; d < durasi; d++) {
      const sarapan = MENU_POOL.filter(m => m.tipe === 'sarapan')[d % 4];
      const siang = MENU_POOL.filter(m => m.tipe === 'makan_siang')[d % 4];
      const malam = MENU_POOL.filter(m => m.tipe === 'makan_malam')[d % 4];
      hari.push({
        hari: namaHari[d % 7],
        menu: [
          { ...sarapan, id: uid(), tipe: 'Sarapan' },
          { ...siang, id: uid(), tipe: 'Makan Siang' },
          { ...malam, id: uid(), tipe: 'Makan Malam' }
        ],
        totalKalori: sarapan.kalori + siang.kalori + malam.kalori,
        totalHarga: sarapan.harga + siang.harga + malam.harga
      });
    }
    return hari;
  }

  // ─── UTILS UI ────────────────────────────────────────────────────────────────
  const UI = {
    // Tampilkan toast notifikasi
    toast: (msg, type = 'success') => {
      const colors = { success: '#22521f', error: '#ba1a1a', info: '#924c00' };
      const icons = { success: 'check_circle', error: 'error', info: 'info' };
      const el = document.createElement('div');
      el.innerHTML = `
        <div style="position:fixed;bottom:24px;right:24px;z-index:9999;
          background:#fff;border-left:4px solid ${colors[type]};
          border-radius:10px;padding:14px 20px;box-shadow:0 8px 32px rgba(0,0,0,.12);
          display:flex;align-items:center;gap:12px;
          animation:slideIn .3s ease;max-width:320px;">
          <span class="material-symbols-outlined" style="color:${colors[type]};font-variation-settings:'FILL' 1">${icons[type]}</span>
          <span style="font-family:'Plus Jakarta Sans',sans-serif;font-size:14px;font-weight:500;color:#27180a">${msg}</span>
        </div>
        <style>@keyframes slideIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}</style>
      `;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3500);
    },

    // Format Rupiah
    rupiah: (n) => 'Rp ' + Number(n).toLocaleString('id-ID'),

    // Format tanggal Indonesia
    tanggal: (str) => {
      const d = new Date(str);
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
    },

    // Update elemen dengan data user di navbar
    updateNavUser: () => {
      const u = User.get();
      document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = u.name || 'Pengguna');
      document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = u.email || '');
      document.querySelectorAll('[data-user-avatar]').forEach(el => el.src = u.avatar || '');
    },

    // Guard: redirect ke login jika belum login
    requireAuth: (redirectTo = 'masuk.html') => {
      if (!User.isLoggedIn()) {
        window.location.href = redirectTo;
        return false;
      }
      return true;
    }
  };

  // Init saat script load
  initDefaults();

  return { User, Profile, Prefs, Plans, Log, UI, today, uid };
})();

// Export global
window.NutriStore = NutriStore;