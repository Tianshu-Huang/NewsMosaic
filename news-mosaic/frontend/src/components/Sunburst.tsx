import React, { useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import "./mosaicStart.css"

type Props = {
  title?: string
  subtitle?: string
  ctaText?: string
  onStart?: () => void
  // 你也可以在外面传颜色种子，用来“base on cluster”
  seed?: number
}

type Tile = {
  id: string
  x: number
  y: number
  w: number
  h: number
  r: number
  delay: number
  dur: number
  hue: number
  sat: number
  lig: number
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return function () {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export default function MosaicStartScreen({
  title = "News Mosaic",
  subtitle = "A mosaic-style briefing board. Tap start to enter.",
  ctaText = "Start",
  onStart,
  seed = 2026,
}: Props) {
  const [leaving, setLeaving] = useState(false)

  const tiles = useMemo(() => {
    // 可调：网格大小
    const cols = 14
    const rows = 9

    const rand = mulberry32(seed)
    const list: Tile[] = []

    // 做一些 1x1 / 2x1 / 1x2 / 2x2 混合马赛克块
    const used = new Set<string>()
    const key = (c: number, r: number) => `${c},${r}`

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (used.has(key(c, r))) continue

        const pick = rand()
        let w = 1
        let h = 1

        if (pick > 0.86) {
          w = 2
          h = 2
        } else if (pick > 0.72) {
          w = 2
          h = 1
        } else if (pick > 0.58) {
          w = 1
          h = 2
        }

        // 边界修正
        if (c + w > cols) w = 1
        if (r + h > rows) h = 1

        // 标记占用
        for (let rr = r; rr < r + h; rr++) {
          for (let cc = c; cc < c + w; cc++) {
            used.add(key(cc, rr))
          }
        }

        // “彩色马赛克”：HSL 随机，但不要太脏
        const hue = Math.floor(rand() * 360)
        const sat = clamp(55 + rand() * 30, 45, 85)
        const lig = clamp(35 + rand() * 25, 28, 62)

        list.push({
          id: `${c}-${r}`,
          x: c,
          y: r,
          w,
          h,
          r: Math.floor(rand() * 12) + 10,
          delay: rand() * 0.6,
          dur: 2.6 + rand() * 2.6,
          hue,
          sat,
          lig,
        })
      }
    }

    return { cols, rows, list }
  }, [seed])

  const handleStart = () => {
    if (leaving) return
    setLeaving(true)
  }

  return (
    <div className="ms-wrap">
      <AnimatePresence>
        {!leaving && (
          <motion.div
            className="ms-stage"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* 马赛克背景 */}
            <div
              className="ms-grid"
              style={
                {
                  ["--cols" as any]: tiles.cols,
                  ["--rows" as any]: tiles.rows,
                } as React.CSSProperties
              }
            >
              {tiles.list.map((t) => (
                <motion.div
                  key={t.id}
                  className="ms-tile"
                  style={
                    {
                      ["--x" as any]: t.x,
                      ["--y" as any]: t.y,
                      ["--w" as any]: t.w,
                      ["--h" as any]: t.h,
                      ["--r" as any]: `${t.r}px`,
                      ["--hue" as any]: t.hue,
                      ["--sat" as any]: `${t.sat}%`,
                      ["--lig" as any]: `${t.lig}%`,
                    } as React.CSSProperties
                  }
                  initial={{ opacity: 0, scale: 0.98, y: 6 }}
                  animate={{
                    opacity: 1,
                    scale: 1,
                    y: 0,
                  }}
                  transition={{
                    delay: 0.15 + t.delay,
                    duration: 0.55,
                    ease: "easeOut",
                  }}
                >
                  {/* 漂浮 + 微闪 */}
                  <motion.div
                    className="ms-tileInner"
                    animate={{
                      y: [0, -4, 0, 3, 0],
                      opacity: [0.92, 1, 0.95, 1, 0.92],
                    }}
                    transition={{
                      delay: t.delay,
                      duration: t.dur,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                  />
                </motion.div>
              ))}
            </div>

            {/* 玻璃态内容 */}
            <motion.div
              className="ms-center"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.55, ease: "easeOut" }}
            >
              <div className="ms-badge">MOSAIC MODE</div>
              <h1 className="ms-title">{title}</h1>
              <p className="ms-subtitle">{subtitle}</p>

              <div className="ms-actions">
                <button className="ms-btn" onClick={handleStart}>
                  <span className="ms-btnDot" />
                  {ctaText}
                </button>
                <div className="ms-hint">Tip: 你可以把 seed 设成 clusterId，让配色跟着主题走。</div>
              </div>
            </motion.div>

            {/* 边角轻微暗角 */}
            <div className="ms-vignette" />
          </motion.div>
        )}

        {/* 退出动画：马赛克聚拢/散开 */}
        {leaving && (
          <motion.div
            className="ms-leave"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onAnimationComplete={() => {
              // 给一点点时间感
              onStart?.()
            }}
          >
            <div
              className="ms-grid ms-gridLeave"
              style={
                {
                  ["--cols" as any]: tiles.cols,
                  ["--rows" as any]: tiles.rows,
                } as React.CSSProperties
              }
            >
              {tiles.list.map((t) => {
                // 向中心聚拢：根据距离中心决定延迟
                const cx = (tiles.cols - 1) / 2
                const cy = (tiles.rows - 1) / 2
                const dx = t.x - cx
                const dy = t.y - cy
                const dist = Math.sqrt(dx * dx + dy * dy)
                const delay = dist * 0.03

                return (
                  <motion.div
                    key={`leave-${t.id}`}
                    className="ms-tile"
                    style={
                      {
                        ["--x" as any]: t.x,
                        ["--y" as any]: t.y,
                        ["--w" as any]: t.w,
                        ["--h" as any]: t.h,
                        ["--r" as any]: `${t.r}px`,
                        ["--hue" as any]: t.hue,
                        ["--sat" as any]: `${t.sat}%`,
                        ["--lig" as any]: `${t.lig}%`,
                      } as React.CSSProperties
                    }
                    initial={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
                    animate={{
                      opacity: 0,
                      scale: 0.65,
                      filter: "blur(6px)",
                    }}
                    transition={{
                      delay,
                      duration: 0.55,
                      ease: "easeIn",
                    }}
                  >
                    <div className="ms-tileInner" />
                  </motion.div>
                )
              })}
            </div>

            <motion.div
              className="ms-leaveText"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
            >
              entering…
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
