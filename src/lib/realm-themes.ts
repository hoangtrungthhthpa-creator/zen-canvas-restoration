// Theme môi trường & vật phẩm tự tiến hóa theo nhóm Cảnh Giới (realmIndex 0-9).
// Nhóm 0: realm 1-3 | Nhóm 1: realm 4-6 | Nhóm 2: realm 7-9 | Nhóm 3: realm 10
export type RealmTheme = {
  name: string
  // lớp phủ màu lên tilemap nền
  groundTint: string
  // tô màu lại sprite cây / linh thạch / bí kíp (source-atop)
  treeTint: string | null
  stoneTint: string | null
  bookTint: string | null
  // màu hào quang vật phẩm "r,g,b"
  stoneGlow: string
  bookGlow: string
  herbColor: string
  moteColor: string
  // hiệu ứng riêng
  stonePulse: boolean // nhịp pulse mạnh (Trung Phẩm)
  stoneParticles: boolean // tia particle (Thượng Phẩm)
  stoneRainbow: boolean // gradient rainbow xoay hue (Tiên Thạch)
  bookSwirl: boolean // linh khí xoay quanh sách
  bookRainbowAura: boolean // aura ngũ sắc (Ngọc Giản)
  formationRing: boolean // trận pháp quay dưới chân vật phẩm
  mist: boolean // mây mờ trôi
  leaves: "none" | "goldred" | "petal" // lá rơi
  lightning: boolean // tia linh khí sấm sét
  stoneLabel: string
  bookLabel: string
}

export const REALM_THEMES: RealmTheme[] = [
  {
    // Nhóm 1: Luyện Khí / Trúc Cơ / Kim Đan — sàn đá cổ rêu, Linh Thụ xanh
    name: "Linh Cảnh Sơ Khai",
    groundTint: "rgba(30, 70, 50, 0.10)",
    treeTint: null,
    stoneTint: null,
    bookTint: null,
    stoneGlow: "120, 235, 200",
    bookGlow: "255, 214, 120",
    herbColor: "150, 240, 200",
    moteColor: "200, 255, 230",
    stonePulse: false,
    stoneParticles: false,
    stoneRainbow: false,
    bookSwirl: false,
    bookRainbowAura: false,
    formationRing: false,
    mist: false,
    leaves: "none",
    lightning: false,
    stoneLabel: "Linh Thạch Hạ Phẩm",
    bookLabel: "Bí Kíp",
  },
  {
    // Nhóm 2: Nguyên Anh / Hóa Thần / Luyện Hư — Tiên Sơn mây mờ, bạch ngọc
    name: "Tiên Sơn Vân Hải",
    groundTint: "rgba(226, 236, 250, 0.55)",
    treeTint: "rgba(226, 132, 32, 0.72)",
    stoneTint: "rgba(150, 80, 230, 0.80)",
    bookTint: "rgba(230, 185, 80, 0.55)",
    stoneGlow: "186, 120, 255",
    bookGlow: "255, 205, 110",
    herbColor: "230, 220, 180",
    moteColor: "225, 205, 255",
    stonePulse: true,
    stoneParticles: false,
    stoneRainbow: false,
    bookSwirl: true,
    bookRainbowAura: false,
    formationRing: false,
    mist: true,
    leaves: "goldred",
    lightning: false,
    stoneLabel: "Linh Thạch Trung Phẩm",
    bookLabel: "Lụa Thư",
  },
  {
    // Nhóm 3: Hợp Thể / Đại Thừa / Độ Kiếp — Thái Cổ Thần Điện, cẩm thạch
    name: "Thái Cổ Thần Điện",
    groundTint: "rgba(48, 30, 96, 0.66)",
    treeTint: "rgba(130, 190, 250, 0.70)",
    stoneTint: "rgba(225, 40, 55, 0.80)",
    bookTint: "rgba(110, 225, 205, 0.60)",
    stoneGlow: "255, 90, 90",
    bookGlow: "255, 225, 130",
    herbColor: "180, 200, 255",
    moteColor: "255, 200, 160",
    stonePulse: true,
    stoneParticles: true,
    stoneRainbow: false,
    bookSwirl: true,
    bookRainbowAura: true,
    formationRing: false,
    mist: false,
    leaves: "none",
    lightning: true,
    stoneLabel: "Linh Thạch Thượng Phẩm",
    bookLabel: "Ngọc Giản",
  },
  {
    // Nhóm 4: Chân Tiên — Cửu Thiên Tiên Giới, hồ ngọc phản mây
    name: "Cửu Thiên Tiên Giới",
    groundTint: "rgba(160, 205, 255, 0.58)",
    treeTint: "rgba(255, 160, 200, 0.62)",
    stoneTint: "rgba(255, 235, 190, 0.55)",
    bookTint: "rgba(255, 205, 70, 0.65)",
    stoneGlow: "255, 255, 255",
    bookGlow: "255, 220, 120",
    herbColor: "255, 200, 220",
    moteColor: "255, 240, 250",
    stonePulse: true,
    stoneParticles: true,
    stoneRainbow: true,
    bookSwirl: true,
    bookRainbowAura: true,
    formationRing: true,
    mist: true,
    leaves: "petal",
    lightning: false,
    stoneLabel: "Tiên Thạch",
    bookLabel: "Tiên Tráp",
  },
]

export function getRealmGroup(realmIdx: number): number {
  if (realmIdx >= 9) return 3
  return Math.min(2, Math.floor(realmIdx / 3))
}

// Hệ số nhân Linh Khí thưởng theo nhóm cảnh giới (cấp cao thưởng nhiều hơn)
export function rewardMultiplier(realmIdx: number): number {
  return 1 + getRealmGroup(realmIdx)
}
