"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  loadPixelAssets,
  PLAYER_DIR_ROW,
  PLAYER_FRAME_MS,
  PLAYER_FRAMES,
  SPRITE_HEIGHTS,
  type PixelAssets,
  type PlayerDirection,
} from "@/lib/pixel-assets"
import { getRealmIndex, randomQuestion, REALMS, type Question } from "@/lib/cultivation-data"
import { getRealmGroup, REALM_THEMES, rewardMultiplier } from "@/lib/realm-themes"

const WORLD = 2200
const PLAYER_R = 26
const PLAYER_SPEED = 190
// Kích cỡ 1 ô tilemap đá cổ trong toạ độ thế giới
const GROUND_TILE = 288

type Vec = { x: number; y: number }
type Interactive = { id: number; x: number; y: number; type: "stone" | "book"; active: boolean; respawnAt: number }
type Tree = { x: number; y: number; scale: number }
type Herb = { x: number; y: number; phase: number; h: number }
type Mote = { x: number; y: number; r: number; speed: number; phase: number }
type Mist = { x: number; y: number; rx: number; ry: number; speed: number; phase: number }
type Leaf = { x: number; y: number; speed: number; sway: number; phase: number; hue: number; size: number }
type TintKind = "tree" | "stone" | "scroll"
type Bolt = { pts: Vec[]; until: number; next: number }

type Tinted = Record<TintKind, (HTMLCanvasElement | null)[]>
type Assets = PixelAssets & { groundPattern: CanvasPattern | null; tinted: Tinted }

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

// Tô màu lại sprite (giữ nguyên alpha) cho từng nhóm cảnh giới
function tintCanvas(src: HTMLCanvasElement, tint: string): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext("2d")!
  ctx.drawImage(src, 0, 0)
  ctx.globalCompositeOperation = "source-atop"
  ctx.fillStyle = tint
  ctx.fillRect(0, 0, c.width, c.height)
  return c
}

export default function CultivationGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const assetsRef = useRef<Assets | null>(null)
  const playerRef = useRef<Vec>({ x: WORLD / 2, y: WORLD / 2 })
  const joyRef = useRef<Vec>({ x: 0, y: 0 })
  const keysRef = useRef<Record<string, boolean>>({})
  const treesRef = useRef<Tree[]>([])
  const herbsRef = useRef<Herb[]>([])
  const motesRef = useRef<Mote[]>([])
  const objectsRef = useRef<Interactive[]>([])
  const pausedRef = useRef(false)
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  const viewRef = useRef({ w: 0, h: 0, dpr: 1 })
  const mistsRef = useRef<Mist[]>([])
  const leavesRef = useRef<Leaf[]>([])
  const boltRef = useRef<Bolt>({ pts: [], until: 0, next: 0 })
  const envGroupRef = useRef(0)

  // Trạng thái animation Sprite Sheet 4x4: hướng đi (hàng) + frame bước (cột)
  const directionRef = useRef<PlayerDirection>("down")
  const frameIndexRef = useRef(0)
  const frameTimerRef = useRef(0)
  const movingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tuVi, setTuVi] = useState(() => {
    // DEV TEST: ?tuvi=NNN
    const v = Number(new URLSearchParams(window.location.search).get("tuvi") || 0)
    return Number.isFinite(v) ? v : 0
  })
  const [quiz, setQuiz] = useState<{ q: Question; objId: number } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [breakthrough, setBreakthrough] = useState<string | null>(null)
  const [envFade, setEnvFade] = useState<"idle" | "out" | "in">("idle")
  const [envToast, setEnvToast] = useState<string | null>(null)

  const tuViRef = useRef(0)
  useEffect(() => {
    tuViRef.current = tuVi
  }, [tuVi])
  useEffect(() => {
    envGroupRef.current = getRealmGroup(getRealmIndex(tuViRef.current || tuVi))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nạp bộ ảnh Pixel Art + bố trí thế giới
  useEffect(() => {
    let cancelled = false
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    loadPixelAssets(dpr)
      .then((pixel) => {
        if (cancelled) return
        const c = canvasRef.current
        let groundPattern: CanvasPattern | null = null
        if (c) {
          const ctx = c.getContext("2d")!
          groundPattern = ctx.createPattern(pixel.ground, "repeat")
          // Thu ảnh tile 1024px về kích cỡ ô GROUND_TILE trong thế giới
          groundPattern?.setTransform(new DOMMatrix().scale(GROUND_TILE / pixel.ground.width))
        }
        // Tô màu sẵn sprite theo 4 nhóm cảnh giới
        const tinted: Tinted = { tree: [], stone: [], scroll: [] }
        for (const th of REALM_THEMES) {
          tinted.tree.push(th.treeTint ? tintCanvas(pixel.tree, th.treeTint) : null)
          tinted.stone.push(th.stoneTint ? tintCanvas(pixel.stone, th.stoneTint) : null)
          tinted.scroll.push(th.bookTint ? tintCanvas(pixel.scroll, th.bookTint) : null)
        }
        assetsRef.current = { ...pixel, groundPattern, tinted }

        // Mây mờ trôi + lá rơi (dùng theo nhóm cảnh giới)
        const mists: Mist[] = []
        for (let i = 0; i < 8; i++) {
          mists.push({ x: rand(0, WORLD), y: rand(0, WORLD), rx: rand(160, 320), ry: rand(50, 90), speed: rand(8, 22), phase: rand(0, Math.PI * 2) })
        }
        mistsRef.current = mists
        const leaves: Leaf[] = []
        for (let i = 0; i < 26; i++) {
          leaves.push({ x: rand(0, WORLD), y: rand(0, WORLD), speed: rand(24, 52), sway: rand(10, 26), phase: rand(0, Math.PI * 2), hue: rand(0, 1), size: rand(4, 8) })
        }
        leavesRef.current = leaves

        // Cây linh thụ rải rác, tránh tâm bản đồ
        const trees: Tree[] = []
        for (let i = 0; i < 22; i++) {
          let x = 0
          let y = 0
          do {
            x = rand(160, WORLD - 160)
            y = rand(160, WORLD - 160)
          } while (Math.hypot(x - WORLD / 2, y - WORLD / 2) < 240)
          trees.push({ x, y, scale: rand(0.7, 1.1) })
        }
        treesRef.current = trees

        // Linh thảo nhấp nhô theo gió
        const herbs: Herb[] = []
        for (let i = 0; i < 160; i++) {
          herbs.push({ x: rand(20, WORLD - 20), y: rand(20, WORLD - 20), phase: rand(0, Math.PI * 2), h: rand(8, 16) })
        }
        herbsRef.current = herbs

        // Đốm linh khí bay lơ lửng
        const motes: Mote[] = []
        for (let i = 0; i < 90; i++) {
          motes.push({ x: rand(0, WORLD), y: rand(0, WORLD), r: rand(1.2, 2.6), speed: rand(6, 16), phase: rand(0, Math.PI * 2) })
        }
        motesRef.current = motes

        // Vật thể tương tác (Linh Thạch / Bí Kíp)
        const objects: Interactive[] = []
        for (let i = 0; i < 10; i++) {
          objects.push({
            id: i,
            x: rand(160, WORLD - 160),
            y: rand(160, WORLD - 160),
            type: i % 3 === 0 ? "book" : "stone",
            active: true,
            respawnAt: 0,
          })
        }
        objectsRef.current = objects

        setReady(true)
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const relocate = useCallback((o: Interactive) => {
    o.x = rand(160, WORLD - 160)
    o.y = rand(160, WORLD - 160)
    o.active = true
  }, [])

  const openQuiz = useCallback((objId: number) => {
    pausedRef.current = true
    setPicked(null)
    setQuiz({ q: randomQuestion(), objId })
  }, [])

  const answer = useCallback(
    (idx: number) => {
      if (!quiz || picked !== null) return
      setPicked(idx)
      const correct = idx === quiz.q.answer
      const obj = objectsRef.current.find((o) => o.id === quiz.objId)

      window.setTimeout(() => {
        if (correct) {
          const prevIdx = getRealmIndex(tuViRef.current)
          // Linh Khí thưởng tăng theo nhóm cảnh giới hiện tại
          const reward = quiz.q.reward * rewardMultiplier(prevIdx)
          const next = tuViRef.current + reward
          const nextIdx = getRealmIndex(next)
          setTuVi(next)
          if (nextIdx > prevIdx) {
            setBreakthrough(REALMS[nextIdx].name)
            window.setTimeout(() => setBreakthrough(null), 2600)
            // Sang nhóm Tiên Cảnh mới: fade out/in 1s + toast
            const prevGroup = getRealmGroup(prevIdx)
            const nextGroup = getRealmGroup(nextIdx)
            if (nextGroup > prevGroup) {
              setEnvFade("out")
              window.setTimeout(() => {
                envGroupRef.current = nextGroup
                setEnvFade("in")
                setEnvToast("Mở khóa Tiên Cảnh Mới!")
                window.setTimeout(() => setEnvFade("idle"), 1000)
                window.setTimeout(() => setEnvToast(null), 2400)
              }, 1000)
            }
          } else {
            setToast(`+${reward} Tu Vi`)
            window.setTimeout(() => setToast(null), 1400)
          }
        } else {
          setToast("Trả lời sai — Tâm ma quấy nhiễu!")
          window.setTimeout(() => setToast(null), 1500)
        }
        if (obj) {
          obj.active = false
          obj.respawnAt = performance.now() + 2600
        }
        setQuiz(null)
        setPicked(null)
        pausedRef.current = false
      }, 750)
    },
    [quiz, picked],
  )

  // Điều khiển bàn phím (bổ trợ cho Joystick)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true
    }
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  // Resize canvas theo container (DPR)
  useEffect(() => {
    const resize = () => {
      const wrap = wrapRef.current
      const c = canvasRef.current
      if (!wrap || !c) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      c.width = w * dpr
      c.height = h * dpr
      c.style.width = `${w}px`
      c.style.height = `${h}px`
      viewRef.current = { w, h, dpr }
    }
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [ready])

  // Render loop
  useEffect(() => {
    if (!ready) return
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")!

    const loop = (t: number) => {
      const dt = Math.min((t - (lastRef.current || t)) / 1000, 0.05)
      lastRef.current = t
      const assets = assetsRef.current!
      const { w, h, dpr } = viewRef.current
      const player = playerRef.current

      // --- CẬP NHẬT ---
      if (!pausedRef.current) {
        let dx = joyRef.current.x
        let dy = joyRef.current.y
        const k = keysRef.current
        if (k["arrowleft"] || k["a"]) dx -= 1
        if (k["arrowright"] || k["d"]) dx += 1
        if (k["arrowup"] || k["w"]) dy -= 1
        if (k["arrowdown"] || k["s"]) dy += 1
        const len = Math.hypot(dx, dy)
        if (len > 1) {
          dx /= len
          dy /= len
        }

        const moving = Math.hypot(dx, dy) > 0.15
        movingRef.current = moving
        if (moving) {
          // Hướng ưu tiên theo trục có biên độ lớn hơn
          if (Math.abs(dx) >= Math.abs(dy)) {
            directionRef.current = dx < 0 ? "left" : "right"
          } else {
            directionRef.current = dy < 0 ? "up" : "down"
          }
          // Đổi frame 0 -> 3 mỗi PLAYER_FRAME_MS
          frameTimerRef.current += dt * 1000
          while (frameTimerRef.current >= PLAYER_FRAME_MS) {
            frameTimerRef.current -= PLAYER_FRAME_MS
            frameIndexRef.current = (frameIndexRef.current + 1) % PLAYER_FRAMES
          }
        } else {
          // Đứng yên: về frame 0 của hướng vừa đi
          frameIndexRef.current = 0
          frameTimerRef.current = 0
        }

        let nx = player.x + dx * PLAYER_SPEED * dt
        let ny = player.y + dy * PLAYER_SPEED * dt
        nx = Math.max(PLAYER_R, Math.min(WORLD - PLAYER_R, nx))
        ny = Math.max(PLAYER_R, Math.min(WORLD - PLAYER_R, ny))

        // Va chạm với gốc cây (chướng ngại vật)
        for (const tr of treesRef.current) {
          const trunkR = 26 * tr.scale + PLAYER_R
          const dist = Math.hypot(nx - tr.x, ny - tr.y)
          if (dist < trunkR) {
            const ang = Math.atan2(ny - tr.y, nx - tr.x)
            nx = tr.x + Math.cos(ang) * trunkR
            ny = tr.y + Math.sin(ang) * trunkR
          }
        }
        player.x = nx
        player.y = ny

        // Hồi sinh vật thể + kiểm tra va chạm mở trắc nghiệm
        for (const o of objectsRef.current) {
          if (!o.active) {
            if (o.respawnAt && t >= o.respawnAt) {
              o.respawnAt = 0
              relocate(o)
            }
            continue
          }
          if (Math.hypot(player.x - o.x, player.y - o.y) < PLAYER_R + 26) {
            openQuiz(o.id)
            break
          }
        }
      }

      // Camera
      let camX = player.x - w / 2
      let camY = player.y - h / 2
      camX = Math.max(0, Math.min(WORLD - w, camX))
      camY = Math.max(0, Math.min(WORLD - h, camY))
      const inView = (x: number, y: number, pad: number) =>
        x > camX - pad && x < camX + w + pad && y > camY - pad && y < camY + h + pad

      // --- VẼ ---
      const theme = REALM_THEMES[envGroupRef.current]
      const g = envGroupRef.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.save()
      ctx.translate(-camX, -camY)

      // Tilemap theo nhóm cảnh giới (đá cổ rêu / bạch ngọc / cẩm thạch / hồ ngọc)
      if (assets.groundPattern) {
        ctx.fillStyle = assets.groundPattern
        ctx.fillRect(camX, camY, w, h)
        ctx.fillStyle = theme.groundTint
        ctx.fillRect(camX, camY, w, h)
      }

      // Mây mờ trôi (Tiên Sơn / Cửu Thiên)
      if (theme.mist) {
        for (const m of mistsRef.current) {
          const mx = ((m.x + (t / 1000) * m.speed) % (WORLD + m.rx * 2)) - m.rx
          const my = m.y + Math.sin(t / 2600 + m.phase) * 18
          if (!inView(mx, my, m.rx)) continue
          const grad = ctx.createRadialGradient(mx, my, 0, mx, my, m.rx)
          grad.addColorStop(0, "rgba(255, 255, 255, 0.13)")
          grad.addColorStop(1, "rgba(255, 255, 255, 0)")
          ctx.fillStyle = grad
          ctx.save()
          ctx.translate(mx, my)
          ctx.scale(1, m.ry / m.rx)
          ctx.beginPath()
          ctx.arc(0, 0, m.rx, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // Linh thảo nhấp nhô theo gió
      ctx.lineCap = "round"
      for (const hb of herbsRef.current) {
        if (!inView(hb.x, hb.y, 24)) continue
        const sway = Math.sin(t / 520 + hb.phase) * 3.5
        const glow = 0.55 + 0.35 * Math.sin(t / 700 + hb.phase * 1.7)
        ctx.strokeStyle = `rgba(${theme.herbColor}, ${glow})`
        ctx.lineWidth = 2
        for (let i = -1; i <= 1; i++) {
          ctx.beginPath()
          ctx.moveTo(hb.x + i * 3, hb.y)
          ctx.quadraticCurveTo(hb.x + i * 4 + sway * 0.5, hb.y - hb.h * 0.55, hb.x + i * 5 + sway, hb.y - hb.h)
          ctx.stroke()
        }
      }

      // Sắp xếp theo trục Y để tạo chiều sâu
      const drawables: { y: number; fn: () => void }[] = []

      for (const tr of treesRef.current) {
        const treeImg = assets.tinted.tree[g] ?? assets.tree
        const dh = SPRITE_HEIGHTS.tree * tr.scale
        const dw = (treeImg.width / treeImg.height) * dh
        if (!inView(tr.x, tr.y, Math.max(dw, dh))) continue
        drawables.push({
          y: tr.y,
          fn: () => {
            // Bóng đổ gốc cây
            ctx.save()
            ctx.fillStyle = "rgba(10, 30, 25, 0.35)"
            ctx.beginPath()
            ctx.ellipse(tr.x, tr.y + 6, dw * 0.28, dh * 0.05, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            // Tán cây đung đưa nhẹ
            const sway = Math.sin(t / 900 + tr.x) * 0.012
            ctx.save()
            ctx.translate(tr.x, tr.y)
            ctx.rotate(sway)
            ctx.drawImage(treeImg, -dw / 2, -dh + 14 * tr.scale, dw, dh)
            ctx.restore()
          },
        })
      }

      for (const o of objectsRef.current) {
        if (!o.active) continue
        if (!inView(o.x, o.y, 80)) continue
        const baseImg = o.type === "stone" ? assets.stone : assets.scroll
        const img = o.type === "stone" ? (assets.tinted.stone[g] ?? baseImg) : (assets.tinted.scroll[g] ?? baseImg)
        const dh = o.type === "stone" ? SPRITE_HEIGHTS.stone : SPRITE_HEIGHTS.scroll
        const dw = (img.width / img.height) * dh
        const float = Math.sin(t / 420 + o.id) * 6
        drawables.push({
          y: o.y,
          fn: () => {
            // Trung Phẩm trở lên: nhịp pulse mạnh hơn
            const pulseSpeed = theme.stonePulse ? 170 : 240
            const pulse = 0.5 + 0.5 * Math.sin(t / pulseSpeed + o.id * 2)
            const isStone = o.type === "stone"
            const glowColor = isStone ? theme.stoneGlow : theme.bookGlow

            // Trận pháp quay dưới chân vật phẩm (Tiên Tráp / Tiên Thạch)
            if (theme.formationRing) {
              ctx.save()
              ctx.translate(o.x, o.y + dh * 0.45)
              ctx.rotate(t / 600)
              ctx.strokeStyle = `rgba(255, 215, 130, ${0.35 + 0.25 * pulse})`
              ctx.lineWidth = 1.6
              ctx.beginPath()
              ctx.ellipse(0, 0, dw * 0.55, dw * 0.2, 0, 0, Math.PI * 2)
              ctx.stroke()
              for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 * i) / 8
                ctx.beginPath()
                ctx.moveTo(Math.cos(a) * dw * 0.34, Math.sin(a) * dw * 0.125)
                ctx.lineTo(Math.cos(a) * dw * 0.55, Math.sin(a) * dw * 0.2)
                ctx.stroke()
              }
              ctx.restore()
            }

            // Bóng đổ co giãn theo độ cao lơ lửng
            ctx.save()
            ctx.fillStyle = "rgba(10, 30, 25, 0.35)"
            ctx.beginPath()
            ctx.ellipse(o.x, o.y + dh * 0.45, dw * 0.32 - float * 0.6, 6 - float * 0.25, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()

            // Hào quang toả sáng — Tiên Thạch xoay hue rainbow, Ngọc Giản/Tiên Tráp ngũ sắc
            ctx.save()
            const cy = o.y + float
            let c0: string
            let c1: string
            if (isStone && theme.stoneRainbow) {
              const hue = (t / 12 + o.id * 60) % 360
              c0 = `hsla(${hue}, 95%, 72%, ${0.5 + 0.25 * pulse})`
              c1 = `hsla(${(hue + 90) % 360}, 95%, 65%, 0)`
            } else if (!isStone && theme.bookRainbowAura) {
              const hue = (t / 16 + o.id * 45) % 360
              c0 = `hsla(${hue}, 90%, 75%, ${0.4 + 0.2 * pulse})`
              c1 = `hsla(${(hue + 140) % 360}, 90%, 70%, 0)`
            } else {
              c0 = `rgba(${glowColor}, ${0.35 + 0.25 * pulse})`
              c1 = `rgba(${glowColor}, 0)`
            }
            const grad = ctx.createRadialGradient(o.x, cy, 6, o.x, cy, dh * 0.9)
            grad.addColorStop(0, c0)
            grad.addColorStop(1, c1)
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(o.x, cy, dh * 0.9, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()

            // Tia particle bắn ra quanh Thượng Phẩm / Tiên Thạch
            if (isStone && theme.stoneParticles) {
              ctx.save()
              for (let i = 0; i < 6; i++) {
                const a = t / 300 + (Math.PI * 2 * i) / 6
                const rr = dh * (0.35 + 0.3 * ((t / 500 + i * 0.37) % 1))
                const alpha = 0.7 * (1 - rr / (dh * 0.7))
                ctx.fillStyle = theme.stoneRainbow
                  ? `hsla(${(t / 12 + i * 60) % 360}, 95%, 75%, ${alpha})`
                  : `rgba(${glowColor}, ${alpha})`
                ctx.beginPath()
                ctx.arc(o.x + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8, 2.2, 0, Math.PI * 2)
                ctx.fill()
              }
              ctx.restore()
            }

            // Linh khí xoay quanh sách (Lụa Thư / Ngọc Giản / Tiên Tráp)
            if (!isStone && theme.bookSwirl) {
              ctx.save()
              ctx.strokeStyle = `rgba(${glowColor}, 0.55)`
              ctx.lineWidth = 1.6
              for (let i = 0; i < 3; i++) {
                const a0 = t / 350 + (Math.PI * 2 * i) / 3
                ctx.beginPath()
                ctx.arc(o.x, cy, dh * 0.55, a0, a0 + Math.PI * 0.55)
                ctx.stroke()
              }
              ctx.restore()
            }

            // Sprite vật thể
            const s = 1 + 0.04 * pulse
            ctx.drawImage(img, o.x - (dw * s) / 2, o.y - (dh * s) / 2 + float, dw * s, dh * s)

            // Nhãn phẩm cấp vật phẩm
            ctx.save()
            ctx.font = "11px serif"
            ctx.textAlign = "center"
            ctx.fillStyle = `rgba(${glowColor}, 0.9)`
            ctx.shadowColor = `rgba(${glowColor}, 0.8)`
            ctx.shadowBlur = 6
            ctx.fillText(isStone ? theme.stoneLabel : theme.bookLabel, o.x, o.y - dh * 0.62 + float)
            ctx.restore()
          },
        })
      }

      // Người chơi: bóng đổ + hào quang xoay + frame Sprite Sheet theo hướng
      drawables.push({
        y: player.y,
        fn: () => {
          ctx.save()
          ctx.fillStyle = "rgba(10, 30, 25, 0.4)"
          ctx.beginPath()
          ctx.ellipse(player.x, player.y + 6, 24, 8, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()

          // Hào quang linh lực xoay tròn
          ctx.save()
          ctx.translate(player.x, player.y - 30)
          ctx.rotate(t / 700)
          const aura = ctx.createRadialGradient(0, 0, 8, 0, 0, 58)
          aura.addColorStop(0, "rgba(160, 240, 210, 0.4)")
          aura.addColorStop(1, "rgba(160, 240, 210, 0)")
          ctx.fillStyle = aura
          ctx.beginPath()
          ctx.arc(0, 0, 58, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = "rgba(231, 200, 106, 0.5)"
          ctx.lineWidth = 2
          for (let i = 0; i < 6; i++) {
            const a = (Math.PI * 2 * i) / 6
            ctx.beginPath()
            ctx.moveTo(Math.cos(a) * 34, Math.sin(a) * 34)
            ctx.lineTo(Math.cos(a) * 50, Math.sin(a) * 50)
            ctx.stroke()
          }
          ctx.restore()

          // Cắt đúng ô (hàng = hướng, cột = frame) từ sheet 4x4 rồi vẽ
          const sheet = assets.player
          const dh = SPRITE_HEIGHTS.player
          const dw = (sheet.frameW / sheet.frameH) * dh
          const sx = frameIndexRef.current * sheet.frameW
          const sy = PLAYER_DIR_ROW[directionRef.current] * sheet.frameH
          ctx.drawImage(sheet.canvas, sx, sy, sheet.frameW, sheet.frameH, player.x - dw / 2, player.y + 4 - dh, dw, dh)
        },
      })

      drawables.sort((a, b) => a.y - b.y)
      drawables.forEach((d) => d.fn())

      // Đốm linh khí bay lơ lửng phía trên mọi vật
      for (const m of motesRef.current) {
        const my = m.y - ((t / 1000) * m.speed) % WORLD
        const wrappedY = ((my % WORLD) + WORLD) % WORLD
        const mx = m.x + Math.sin(t / 1300 + m.phase) * 14
        if (!inView(mx, wrappedY, 10)) continue
        const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t / 500 + m.phase))
        ctx.fillStyle = `rgba(${theme.moteColor}, ${a})`
        ctx.beginPath()
        ctx.arc(mx, wrappedY, m.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // Lá đào / lá vàng đỏ rơi theo gió
      if (theme.leaves !== "none") {
        for (const lf of leavesRef.current) {
          const ly = (lf.y + (t / 1000) * lf.speed) % WORLD
          const lx = lf.x + Math.sin(t / 900 + lf.phase) * lf.sway
          if (!inView(lx, ly, 20)) continue
          const color =
            theme.leaves === "petal"
              ? `rgba(255, ${170 + Math.round(lf.hue * 50)}, ${200 + Math.round(lf.hue * 40)}, 0.85)`
              : lf.hue > 0.5
                ? "rgba(230, 180, 70, 0.9)"
                : "rgba(200, 70, 60, 0.9)"
          ctx.save()
          ctx.translate(lx, ly)
          ctx.rotate(Math.sin(t / 700 + lf.phase) * 0.9)
          ctx.fillStyle = color
          ctx.beginPath()
          ctx.ellipse(0, 0, lf.size, lf.size * 0.45, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
      }

      // Tia linh khí sấm sét (Thái Cổ Thần Điện)
      if (theme.lightning) {
        const bolt = boltRef.current
        if (t >= bolt.next) {
          const x0 = rand(camX, camX + w)
          const y0 = camY
          const pts: Vec[] = [{ x: x0, y: y0 }]
          let px = x0
          let py = y0
          const yEnd = y0 + rand(h * 0.4, h * 0.8)
          while (py < yEnd) {
            px += rand(-40, 40)
            py += rand(40, 90)
            pts.push({ x: px, y: py })
          }
          bolt.pts = pts
          bolt.until = t + 160
          bolt.next = t + rand(900, 2400)
        }
        if (t < bolt.until && bolt.pts.length > 1) {
          const alpha = (bolt.until - t) / 160
          ctx.save()
          ctx.strokeStyle = `rgba(190, 215, 255, ${0.85 * alpha})`
          ctx.lineWidth = 2.5
          ctx.shadowColor = "rgba(160, 190, 255, 0.9)"
          ctx.shadowBlur = 14
          ctx.beginPath()
          ctx.moveTo(bolt.pts[0].x, bolt.pts[0].y)
          for (const p of bolt.pts.slice(1)) ctx.lineTo(p.x, p.y)
          ctx.stroke()
          ctx.restore()
        }
      }

      ctx.restore()
      rafRef.current = requestAnimationFrame(loop)
    }

    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [ready, openQuiz, relocate])

  // --- Joystick pointer handlers ---
  const joyBaseRef = useRef<HTMLDivElement>(null)
  const joyActiveRef = useRef(false)
  const [knob, setKnob] = useState<Vec>({ x: 0, y: 0 })

  const handleJoy = useCallback((clientX: number, clientY: number) => {
    const base = joyBaseRef.current
    if (!base) return
    const r = base.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    let dx = clientX - cx
    let dy = clientY - cy
    const max = r.width / 2
    const dist = Math.hypot(dx, dy)
    if (dist > max) {
      dx = (dx / dist) * max
      dy = (dy / dist) * max
    }
    setKnob({ x: dx, y: dy })
    joyRef.current = { x: dx / max, y: dy / max }
  }, [])

  const endJoy = useCallback(() => {
    joyActiveRef.current = false
    joyRef.current = { x: 0, y: 0 }
    setKnob({ x: 0, y: 0 })
  }, [])

  const realmIdx = getRealmIndex(tuVi)
  const realm = REALMS[realmIdx]
  const nextRealm = REALMS[realmIdx + 1]
  const progress = nextRealm
    ? Math.min(100, ((tuVi - realm.threshold) / (nextRealm.threshold - realm.threshold)) * 100)
    : 100

  return (
    <div
      ref={wrapRef}
      className="relative h-dvh w-full touch-none overflow-hidden bg-ink select-none"
      onPointerMove={(e) => joyActiveRef.current && handleJoy(e.clientX, e.clientY)}
      onPointerUp={endJoy}
      onPointerLeave={endJoy}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Màn hình nạp tài nguyên */}
      {!ready && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-ink">
          <span className="font-serif text-2xl tracking-wide text-gold">Tu Tiên Chi Lộ</span>
          <span className="text-sm text-jade-soft/70">
            {loadError ? `Lỗi nạp đồ hoạ: ${loadError}` : "Đang ngưng tụ linh khí..."}
          </span>
          {!loadError && (
            <div className="h-1 w-40 overflow-hidden rounded-full bg-jade/20">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-jade to-gold" />
            </div>
          )}
        </div>
      )}

      {/* HUD trên cùng */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 p-4">
        <div className="flex items-center gap-3 rounded-full border border-gold/30 bg-ink/70 px-5 py-2 backdrop-blur-sm">
          <span className="font-serif text-lg tracking-wide text-gold text-balance">
            Cảnh Giới: {realm.name}
          </span>
          <span className="text-xs text-jade-soft/70">({realmIdx + 1}/10)</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-1 flex justify-between text-xs text-jade-soft">
            <span>Tu Vi: {tuVi}</span>
            <span>{nextRealm ? `→ ${nextRealm.name} (${nextRealm.threshold})` : "Viên mãn"}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full border border-jade/30 bg-ink/60">
            <div
              className="h-full rounded-full bg-gradient-to-r from-jade to-gold transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Bảng thang cảnh giới */}
      <div className="pointer-events-none absolute right-4 top-24 hidden flex-col gap-1 rounded-xl border border-gold/20 bg-ink/60 p-3 backdrop-blur-sm sm:flex">
        {REALMS.map((r, i) => (
          <div
            key={r.name}
            className={`flex items-center gap-2 text-xs ${
              i === realmIdx ? "text-gold" : i < realmIdx ? "text-jade-soft/50" : "text-jade-soft/30"
            }`}
          >
            <span className="w-4 text-right">{i + 1}</span>
            <span className="font-serif">{r.name}</span>
          </div>
        ))}
      </div>

      {/* Gợi ý */}
      {!quiz && (
        <p className="pointer-events-none absolute bottom-6 right-6 max-w-[200px] text-right text-xs leading-relaxed text-jade-soft/60">
          Di chuyển bằng Joystick (hoặc phím WASD) đến Linh Thạch &amp; Bí Kíp để khai mở trắc nghiệm và tích lũy Tu Vi.
        </p>
      )}

      {/* Joystick */}
      <div
        ref={joyBaseRef}
        onPointerDown={(e) => {
          joyActiveRef.current = true
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
          handleJoy(e.clientX, e.clientY)
        }}
        className="absolute bottom-8 left-8 h-32 w-32 rounded-full border-2 border-gold/30 bg-ink/50 backdrop-blur-sm"
      >
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-14 w-14 rounded-full border border-gold/50 bg-gradient-to-br from-jade to-jade/40 shadow-lg"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
      </div>

      {/* Fade chuyển Tiên Cảnh khi sang nhóm cảnh giới mới */}
      <div
        className={`pointer-events-none absolute inset-0 z-30 bg-ink transition-opacity duration-1000 ${
          envFade === "out" ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Toast mở khóa Tiên Cảnh */}
      {envToast && (
        <div className="pointer-events-none absolute left-1/2 top-24 z-30 -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
          <span className="rounded-full border border-gold/50 bg-ink/85 px-5 py-2 font-serif text-lg text-gold drop-shadow-[0_0_18px_rgba(231,200,106,0.5)]">
            {envToast}
          </span>
        </div>
      )}

      {/* Toast +Tu Vi */}
      {toast && (
        <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 animate-in fade-in slide-in-from-bottom-2">
          <span className="rounded-full bg-ink/80 px-4 py-2 font-serif text-lg text-gold">{toast}</span>
        </div>
      )}

      {/* Đột phá cảnh giới */}
      {breakthrough && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-ink/40 backdrop-blur-[2px]">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="font-serif text-sm uppercase tracking-[0.3em] text-jade-soft/80">Đột Phá Cảnh Giới</span>
            <span className="font-serif text-5xl text-gold text-balance drop-shadow-[0_0_25px_rgba(231,200,106,0.6)]">
              {breakthrough}
            </span>
          </div>
        </div>
      )}

      {/* Modal trắc nghiệm */}
      {quiz && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-gold/30 bg-ink/95 p-6 shadow-2xl">
            <p className="mb-1 font-serif text-xs uppercase tracking-[0.25em] text-jade-soft/70">Khảo Nghiệm Đạo Tâm</p>
            <h2 className="mb-5 text-pretty font-serif text-xl text-gold">{quiz.q.q}</h2>
            <div className="flex flex-col gap-3">
              {quiz.q.options.map((opt, i) => {
                const isAnswer = i === quiz.q.answer
                const isPicked = i === picked
                let cls = "border-jade/25 bg-ink/60 text-jade-soft hover:border-gold/60 hover:bg-jade/10"
                if (picked !== null) {
                  if (isAnswer) cls = "border-jade bg-jade/25 text-jade-soft"
                  else if (isPicked) cls = "border-destructive bg-destructive/20 text-jade-soft"
                  else cls = "border-jade/10 bg-ink/40 text-jade-soft/40"
                }
                return (
                  <button
                    key={i}
                    onClick={() => answer(i)}
                    disabled={picked !== null}
                    className={`rounded-xl border px-4 py-3 text-left font-sans text-sm transition-colors ${cls}`}
                  >
                    <span className="mr-2 font-serif text-gold/70">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                )
              })}
            </div>
            <p className="mt-4 text-center text-xs text-jade-soft/50">
              Trả lời đúng để tăng Tu Vi &amp; đột phá cảnh giới
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
