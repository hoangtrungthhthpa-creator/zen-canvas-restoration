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

type Assets = PixelAssets & { groundPattern: CanvasPattern | null }

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
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

  // Trạng thái animation Sprite Sheet 4x4: hướng đi (hàng) + frame bước (cột)
  const directionRef = useRef<PlayerDirection>("down")
  const frameIndexRef = useRef(0)
  const frameTimerRef = useRef(0)
  const movingRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tuVi, setTuVi] = useState(0)
  const [quiz, setQuiz] = useState<{ q: Question; objId: number } | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [breakthrough, setBreakthrough] = useState<string | null>(null)

  const tuViRef = useRef(0)
  useEffect(() => {
    tuViRef.current = tuVi
  }, [tuVi])

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
        assetsRef.current = { ...pixel, groundPattern }

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
          const next = tuViRef.current + quiz.q.reward
          const nextIdx = getRealmIndex(next)
          setTuVi(next)
          if (nextIdx > prevIdx) {
            setBreakthrough(REALMS[nextIdx].name)
            window.setTimeout(() => setBreakthrough(null), 2600)
          } else {
            setToast(`+${quiz.q.reward} Tu Vi`)
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"
      ctx.save()
      ctx.translate(-camX, -camY)

      // Tilemap đá cổ mọc rêu
      if (assets.groundPattern) {
        ctx.fillStyle = assets.groundPattern
        ctx.fillRect(camX, camY, w, h)
      }

      // Linh thảo nhấp nhô theo gió
      ctx.lineCap = "round"
      for (const hb of herbsRef.current) {
        if (!inView(hb.x, hb.y, 24)) continue
        const sway = Math.sin(t / 520 + hb.phase) * 3.5
        const glow = 0.55 + 0.35 * Math.sin(t / 700 + hb.phase * 1.7)
        ctx.strokeStyle = `rgba(150, 240, 200, ${glow})`
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
        const dh = SPRITE_HEIGHTS.tree * tr.scale
        const dw = (assets.tree.width / assets.tree.height) * dh
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
            ctx.drawImage(assets.tree, -dw / 2, -dh + 14 * tr.scale, dw, dh)
            ctx.restore()
          },
        })
      }

      for (const o of objectsRef.current) {
        if (!o.active) continue
        if (!inView(o.x, o.y, 80)) continue
        const img = o.type === "stone" ? assets.stone : assets.scroll
        const dh = o.type === "stone" ? SPRITE_HEIGHTS.stone : SPRITE_HEIGHTS.scroll
        const dw = (img.width / img.height) * dh
        const float = Math.sin(t / 420 + o.id) * 6
        drawables.push({
          y: o.y,
          fn: () => {
            const pulse = 0.5 + 0.5 * Math.sin(t / 240 + o.id * 2)
            // Bóng đổ co giãn theo độ cao lơ lửng
            ctx.save()
            ctx.fillStyle = "rgba(10, 30, 25, 0.35)"
            ctx.beginPath()
            ctx.ellipse(o.x, o.y + dh * 0.45, dw * 0.32 - float * 0.6, 6 - float * 0.25, 0, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            // Hào quang toả sáng
            ctx.save()
            const glowColor = o.type === "stone" ? "160, 240, 220" : "255, 214, 120"
            const grad = ctx.createRadialGradient(o.x, o.y + float, 6, o.x, o.y + float, dh * 0.9)
            grad.addColorStop(0, `rgba(${glowColor}, ${0.35 + 0.25 * pulse})`)
            grad.addColorStop(1, `rgba(${glowColor}, 0)`)
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(o.x, o.y + float, dh * 0.9, 0, Math.PI * 2)
            ctx.fill()
            ctx.restore()
            // Sprite vật thể
            const s = 1 + 0.04 * pulse
            ctx.drawImage(img, o.x - (dw * s) / 2, o.y - (dh * s) / 2 + float, dw * s, dh * s)
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
        ctx.fillStyle = `rgba(200, 255, 230, ${a})`
        ctx.beginPath()
        ctx.arc(mx, wrappedY, m.r, 0, Math.PI * 2)
        ctx.fill()
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
