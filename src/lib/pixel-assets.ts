// Nạp và tiền xử lý bộ ảnh Pixel Art của game.
// Các sprite được sinh trên nền magenta (#FF00FF) phẳng nên có thể khử nền
// bằng chroma-key + flood-fill từ mép ảnh, rồi cắt sát viền và thu về kích
// cỡ hiển thị để ctx.drawImage không phải scale ảnh 1024px mỗi khung hình.

export const PIXEL_SPRITES = {
  playerSheet: "/assets/pixel/player_sheet.png",
  ground: "/assets/pixel/ground.png",
  tree: "/assets/pixel/tree.png",
  stone: "/assets/pixel/stone.png",
  scroll: "/assets/pixel/scroll.png",
} as const

// Sprite Sheet nhân vật: 4 hàng (hướng) x 4 cột (frame bước đi).
export const PLAYER_DIRECTIONS = ["down", "left", "right", "up"] as const
export type PlayerDirection = (typeof PLAYER_DIRECTIONS)[number]
export const PLAYER_DIR_ROW: Record<PlayerDirection, number> = { down: 0, left: 1, right: 2, up: 3 }
export const PLAYER_FRAMES = 4
export const PLAYER_FRAME_MS = 120

// File gốc có 6 cột/hàng; chọn 4 cột trải đều cả vòng bước để ghép sheet 4x4.
const SOURCE_COLS = 6
const SOURCE_ROWS = 4
const SOURCE_FRAME_PICK = [0, 2, 3, 5]

export type SpriteSheet = {
  canvas: HTMLCanvasElement
  frameW: number
  frameH: number
}

export type PixelAssets = {
  player: SpriteSheet
  ground: HTMLImageElement
  tree: HTMLCanvasElement
  stone: HTMLCanvasElement
  scroll: HTMLCanvasElement
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Không nạp được ảnh: ${src}`))
    img.src = src
  })
}

// Độ "magenta" của một pixel: cao khi đỏ & xanh dương lớn, xanh lá nhỏ.
function magentaness(r: number, g: number, b: number) {
  return (r + b) / 2 - g
}

// Khử nền magenta chỉ ở vùng nối liền với mép ảnh (giữ nguyên chi tiết
// tím/hồng bên trong sprite), đồng thời làm mờ dần viền để bớt răng cưa.
function chromaKeyMagenta(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width
  const h = img.height
  const off = document.createElement("canvas")
  off.width = w
  off.height = h
  const ctx = off.getContext("2d")!
  ctx.drawImage(img, 0, 0)

  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  const visited = new Uint8Array(w * h)
  const stack: number[] = []

  const bgScore = (p: number) => {
    const i = p * 4
    return magentaness(d[i], d[i + 1], d[i + 2])
  }

  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (visited[p]) return
    visited[p] = 1
    const s = bgScore(p)
    if (s > 30) {
      // Vùng nền hoặc quầng chuyển tiếp: alpha giảm dần theo độ magenta
      const alpha = s > 100 ? 0 : Math.round(255 * (1 - (s - 30) / 70))
      d[p * 4 + 3] = Math.min(d[p * 4 + 3], alpha)
      if (alpha === 0) stack.push(p)
    }
  }

  for (let x = 0; x < w; x++) {
    visit(x, 0)
    visit(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    visit(0, y)
    visit(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop() as number
    const x = p % w
    const y = (p / w) | 0
    visit(x + 1, y)
    visit(x - 1, y)
    visit(x, y + 1)
    visit(x, y - 1)
  }

  // Khử ánh magenta còn vương trên các pixel viền bán trong suốt
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const a = d[i + 3]
    if (a > 0 && a < 255) {
      const g = d[i + 1]
      d[i] = Math.min(d[i], g + 15)
      d[i + 2] = Math.min(d[i + 2], g + 15)
    }
  }

  ctx.putImageData(data, 0, 0)
  return off
}

// Cắt bỏ phần trong suốt bao quanh sprite.
function trimTransparent(src: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = src.getContext("2d")!
  const { width: w, height: h } = src
  const d = ctx.getImageData(0, 0, w, h).data
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return src
  const out = document.createElement("canvas")
  out.width = maxX - minX + 1
  out.height = maxY - minY + 1
  out.getContext("2d")!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
  return out
}

// Thu sprite về chiều cao mục tiêu (nhân với DPR để giữ nét trên màn hình Retina).
function downscaleToHeight(src: HTMLCanvasElement, targetH: number, dpr: number): HTMLCanvasElement {
  const scale = (targetH * dpr) / src.height
  const out = document.createElement("canvas")
  out.width = Math.max(1, Math.round(src.width * scale))
  out.height = Math.max(1, Math.round(src.height * scale))
  const ctx = out.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(src, 0, 0, out.width, out.height)
  return out
}

function prepareSprite(img: HTMLImageElement, targetH: number, dpr: number) {
  return downscaleToHeight(trimTransparent(chromaKeyMagenta(img)), targetH, dpr)
}

// Nền caro "giả trong suốt" của sheet nhân vật là các ô xám không bão hoà.
function isCheckerGrey(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lum = (r + g + b) / 3
  return max - min < 34 && lum > 48 && lum < 215
}

// Khử nền caro chỉ ở vùng nối liền với mép ảnh, rồi quét thêm vài lượt để
// dọn các pixel xám còn sót do nhiễu JPEG sát viền nhân vật.
function removeCheckerBackground(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.width
  const h = img.height
  const off = document.createElement("canvas")
  off.width = w
  off.height = h
  const ctx = off.getContext("2d")!
  ctx.drawImage(img, 0, 0)

  const data = ctx.getImageData(0, 0, w, h)
  const d = data.data
  const visited = new Uint8Array(w * h)
  const stack: number[] = []

  const isBg = (p: number) => {
    const i = p * 4
    return isCheckerGrey(d[i], d[i + 1], d[i + 2])
  }
  const visit = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const p = y * w + x
    if (visited[p]) return
    visited[p] = 1
    if (isBg(p)) {
      d[p * 4 + 3] = 0
      stack.push(p)
    }
  }
  for (let x = 0; x < w; x++) {
    visit(x, 0)
    visit(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    visit(0, y)
    visit(w - 1, y)
  }
  while (stack.length) {
    const p = stack.pop() as number
    const x = p % w
    const y = (p / w) | 0
    visit(x + 1, y)
    visit(x - 1, y)
    visit(x, y + 1)
    visit(x, y - 1)
  }

  // Dọn viền: pixel xám còn đục nhưng kề ít nhất 2 pixel trong suốt -> xoá
  for (let pass = 0; pass < 3; pass++) {
    const toClear: number[] = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x
        if (d[p * 4 + 3] === 0 || !isBg(p)) continue
        let clear = 0
        if (d[(p - 1) * 4 + 3] === 0) clear++
        if (d[(p + 1) * 4 + 3] === 0) clear++
        if (d[(p - w) * 4 + 3] === 0) clear++
        if (d[(p + w) * 4 + 3] === 0) clear++
        if (clear >= 2) toClear.push(p)
      }
    }
    for (const p of toClear) d[p * 4 + 3] = 0
  }

  ctx.putImageData(data, 0, 0)
  return off
}

// Tách sheet gốc 4x6 thành sheet 4x4 sạch nền, mọi frame dùng chung một khung
// cắt để nhân vật không "nhảy" vị trí giữa các frame, rồi thu về cỡ hiển thị.
function prepareSpriteSheet(img: HTMLImageElement, targetH: number, dpr: number): SpriteSheet {
  const clean = removeCheckerBackground(img)
  const cellW = clean.width / SOURCE_COLS
  const cellH = clean.height / SOURCE_ROWS
  const d = clean.getContext("2d")!.getImageData(0, 0, clean.width, clean.height).data

  // Khung cắt chung (tính theo toạ độ trong ô) bao trọn mọi frame được chọn
  let minX = cellW
  let minY = cellH
  let maxX = 0
  let maxY = 0
  for (let row = 0; row < SOURCE_ROWS; row++) {
    for (const col of SOURCE_FRAME_PICK) {
      const ox = Math.round(col * cellW)
      const oy = Math.round(row * cellH)
      for (let y = 0; y < cellH; y++) {
        for (let x = 0; x < cellW; x++) {
          const px = ox + x
          const py = oy + y
          if (d[(py * clean.width + px) * 4 + 3] > 8) {
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
    }
  }
  const cropW = Math.max(1, maxX - minX + 1)
  const cropH = Math.max(1, maxY - minY + 1)

  const scale = (targetH * dpr) / cropH
  const frameW = Math.max(1, Math.round(cropW * scale))
  const frameH = Math.max(1, Math.round(cropH * scale))

  const out = document.createElement("canvas")
  out.width = frameW * PLAYER_FRAMES
  out.height = frameH * SOURCE_ROWS
  const ctx = out.getContext("2d")!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  for (let row = 0; row < SOURCE_ROWS; row++) {
    SOURCE_FRAME_PICK.forEach((col, frame) => {
      const sx = Math.round(col * cellW) + minX
      const sy = Math.round(row * cellH) + minY
      ctx.drawImage(clean, sx, sy, cropW, cropH, frame * frameW, row * frameH, frameW, frameH)
    })
  }

  buildSideRows(out, ctx, frameW, frameH)
  return { canvas: out, frameW, frameH }
}

// Hai hàng đi ngang được dựng lại từ MỘT tư thế gốc duy nhất:
// - Nửa thân trên (đầu/mặt/thân) lấy cố định từ frame 0 hàng "right" -> hướng
//   nhìn không bao giờ đổi theo frameIndex (hết hiện tượng lật/ping-pong).
// - Nửa dưới (chân + tà áo) mới thay theo frameIndex, kèm nhún nhẹ.
// - Hàng "left" là ảnh phản chiếu ngang cố định của hàng "right".
const LEG_BOB = [0, -1, 0, 1]

function buildSideRows(
  out: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  frameW: number,
  frameH: number,
) {
  const rowRight = PLAYER_DIR_ROW.right
  const rowLeft = PLAYER_DIR_ROW.left
  const cut = Math.round(frameH * 0.55)

  // Bản sao hàng "right" gốc để đọc trong lúc vẽ lại.
  const src = document.createElement("canvas")
  src.width = frameW * PLAYER_FRAMES
  src.height = frameH
  const sctx = src.getContext("2d")!
  sctx.imageSmoothingEnabled = true
  sctx.imageSmoothingQuality = "high"
  sctx.drawImage(out, 0, rowRight * frameH, src.width, frameH, 0, 0, src.width, frameH)

  for (let f = 0; f < PLAYER_FRAMES; f++) {
    const dx = f * frameW
    ctx.clearRect(dx, rowRight * frameH, frameW, frameH)
    // thân trên cố định
    ctx.drawImage(src, 0, 0, frameW, cut, dx, rowRight * frameH, frameW, cut)
    // chân + tà áo theo frame
    const bob = LEG_BOB[f] ?? 0
    ctx.drawImage(
      src,
      dx,
      cut,
      frameW,
      frameH - cut,
      dx,
      rowRight * frameH + cut + bob,
      frameW,
      frameH - cut,
    )
  }

  // snapshot hàng đã rebuild (có nhịp bước chân) — art gốc quay mặt sang trái
  const rebuilt = document.createElement("canvas")
  rebuilt.width = frameW * PLAYER_FRAMES
  rebuilt.height = frameH
  rebuilt.getContext("2d")!.drawImage(out, 0, rowRight * frameH, rebuilt.width, frameH, 0, 0, rebuilt.width, frameH)

  // hàng trái giữ nguyên hướng nhìn trái của art gốc
  for (let f = 0; f < PLAYER_FRAMES; f++) {
    const dx = f * frameW
    ctx.clearRect(dx, rowLeft * frameH, frameW, frameH)
    ctx.drawImage(rebuilt, dx, 0, frameW, frameH, dx, rowLeft * frameH, frameW, frameH)
  }

  // hàng phải = lật gương từ art gốc để mặt nhìn phải
  for (let f = 0; f < PLAYER_FRAMES; f++) {
    const dx = f * frameW
    ctx.clearRect(dx, rowRight * frameH, frameW, frameH)
    ctx.save()
    ctx.translate(dx + frameW, rowRight * frameH)
    ctx.scale(-1, 1)
    ctx.drawImage(rebuilt, dx, 0, frameW, frameH, 0, 0, frameW, frameH)
    ctx.restore()
  }
}

export const SPRITE_HEIGHTS = {
  player: 104,
  tree: 260,
  stone: 64,
  scroll: 64,
} as const

export async function loadPixelAssets(dpr = 1): Promise<PixelAssets> {
  const [player, ground, tree, stone, scroll] = await Promise.all([
    loadImage(PIXEL_SPRITES.playerSheet),
    loadImage(PIXEL_SPRITES.ground),
    loadImage(PIXEL_SPRITES.tree),
    loadImage(PIXEL_SPRITES.stone),
    loadImage(PIXEL_SPRITES.scroll),
  ])

  return {
    player: prepareSpriteSheet(player, SPRITE_HEIGHTS.player, dpr),
    ground,
    tree: prepareSprite(tree, SPRITE_HEIGHTS.tree, dpr),
    stone: prepareSprite(stone, SPRITE_HEIGHTS.stone, dpr),
    scroll: prepareSprite(scroll, SPRITE_HEIGHTS.scroll, dpr),
  }
}
