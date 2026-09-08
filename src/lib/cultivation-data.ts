export type Realm = {
  name: string
  pinyin: string
  threshold: number
}

// 10 Cảnh Giới Tu Tiên — ngưỡng là tổng Tu Vi tích lũy cần để đạt cảnh giới
export const REALMS: Realm[] = [
  { name: "Luyện Khí", pinyin: "Qi Refining", threshold: 0 },
  { name: "Trúc Cơ", pinyin: "Foundation", threshold: 120 },
  { name: "Kim Đan", pinyin: "Golden Core", threshold: 300 },
  { name: "Nguyên Anh", pinyin: "Nascent Soul", threshold: 540 },
  { name: "Hóa Thần", pinyin: "Spirit Severing", threshold: 850 },
  { name: "Luyện Hư", pinyin: "Void Refining", threshold: 1240 },
  { name: "Hợp Thể", pinyin: "Body Integration", threshold: 1720 },
  { name: "Đại Thừa", pinyin: "Great Vehicle", threshold: 2300 },
  { name: "Độ Kiếp", pinyin: "Tribulation", threshold: 3000 },
  { name: "Chân Tiên", pinyin: "True Immortal", threshold: 3900 },
]

export function getRealmIndex(tuVi: number): number {
  let idx = 0
  for (let i = 0; i < REALMS.length; i++) {
    if (tuVi >= REALMS[i].threshold) idx = i
  }
  return idx
}

export type Question = {
  q: string
  options: string[]
  answer: number
  reward: number
}

export const QUESTIONS: Question[] = [
  {
    q: "Trong Hệ Mặt Trời, hành tinh nào lớn nhất?",
    options: ["Sao Thổ", "Sao Mộc", "Sao Hỏa", "Trái Đất"],
    answer: 1,
    reward: 30,
  },
  {
    q: "Kết quả của phép tính 12 × 8 là bao nhiêu?",
    options: ["86", "94", "96", "108"],
    answer: 2,
    reward: 25,
  },
  {
    q: "Nước sôi ở nhiệt độ nào (áp suất thường)?",
    options: ["90°C", "100°C", "110°C", "80°C"],
    answer: 1,
    reward: 25,
  },
  {
    q: "Thủ đô của Việt Nam là thành phố nào?",
    options: ["TP. Hồ Chí Minh", "Đà Nẵng", "Hà Nội", "Huế"],
    answer: 2,
    reward: 20,
  },
  {
    q: "Nguyên tố hóa học có ký hiệu 'O' là gì?",
    options: ["Vàng", "Oxy", "Sắt", "Hydro"],
    answer: 1,
    reward: 30,
  },
  {
    q: "Một năm nhuận có bao nhiêu ngày?",
    options: ["365", "366", "364", "367"],
    answer: 1,
    reward: 25,
  },
  {
    q: "Đơn vị đo cường độ dòng điện là gì?",
    options: ["Vôn", "Oát", "Ampe", "Ôm"],
    answer: 2,
    reward: 35,
  },
  {
    q: "Số nguyên tố nhỏ nhất là số nào?",
    options: ["0", "1", "2", "3"],
    answer: 2,
    reward: 30,
  },
  {
    q: "Loài vật nào được mệnh danh là 'chúa tể rừng xanh'?",
    options: ["Hổ", "Sư tử", "Báo", "Gấu"],
    answer: 1,
    reward: 20,
  },
  {
    q: "Ánh sáng truyền trong chân không với tốc độ xấp xỉ?",
    options: ["300 km/s", "3.000 km/s", "300.000 km/s", "30.000 km/s"],
    answer: 2,
    reward: 40,
  },
  {
    q: "Hình tam giác có tổng ba góc trong bằng bao nhiêu độ?",
    options: ["90°", "180°", "270°", "360°"],
    answer: 1,
    reward: 25,
  },
  {
    q: "Cơ quan nào trong cơ thể người bơm máu đi nuôi toàn thân?",
    options: ["Gan", "Phổi", "Tim", "Thận"],
    answer: 2,
    reward: 30,
  },
]

export function randomQuestion(): Question {
  return QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)]
}
