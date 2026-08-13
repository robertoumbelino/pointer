/* eslint-disable react-refresh/only-export-components -- Next.js metadata exports live beside the image component. */
import { ImageResponse } from 'next/og'

export const alt = 'Pointer — Seu banco no ritmo do seu teclado'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          padding: '64px 72px',
          overflow: 'hidden',
          color: '#f5f6f7',
          background: 'linear-gradient(145deg, #080908 0%, #111419 58%, #080908 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 620,
            height: 620,
            right: -130,
            top: -220,
            borderRadius: 620,
            background: 'radial-gradient(circle, rgba(164, 174, 190, 0.17), rgba(164, 174, 190, 0) 68%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 24,
            display: 'flex',
            border: '1px solid rgba(255, 255, 255, 0.13)',
            borderRadius: 32,
          }}
        />

        <div
          style={{
            width: 238,
            height: 238,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255, 255, 255, 0.14)',
            borderRadius: 52,
            background: 'linear-gradient(145deg, #1b1e22, #070809)',
            boxShadow: '0 28px 70px rgba(0, 0, 0, 0.42)',
          }}
        >
          <div
            style={{
              width: 82,
              height: 82,
              display: 'flex',
              borderRadius: 82,
              background: 'radial-gradient(circle at 35% 30%, #ffffff 0%, #b7c0cd 48%, #596474 100%)',
              boxShadow: '0 0 42px rgba(190, 207, 235, 0.36)',
            }}
          />
        </div>

        <div
          style={{
            marginLeft: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', color: '#9198a2', fontSize: 20, letterSpacing: 4 }}>
            POINTER PARA macOS
          </div>
          <div style={{ display: 'flex', marginTop: 22, fontSize: 72, fontWeight: 700, letterSpacing: -4 }}>
            Pointer
          </div>
          <div style={{ display: 'flex', marginTop: 8, color: '#d3d7dc', fontSize: 36, lineHeight: 1.18, letterSpacing: -1.4 }}>
            Seu banco no ritmo do seu teclado.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: 28, color: '#9299a3', fontSize: 22, lineHeight: 1.4 }}>
            <div style={{ display: 'flex' }}>SQL, tabelas e atalhos para PostgreSQL,</div>
            <div style={{ display: 'flex' }}>ClickHouse e SQLite.</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 30, gap: 12 }}>
            <div style={{ display: 'flex', padding: '8px 13px', border: '1px solid #353b44', borderRadius: 9, color: '#d7dbe0', background: '#171a1e', fontSize: 17 }}>
              CMD + K
            </div>
            <div style={{ display: 'flex', color: '#747b85', fontSize: 18 }}>
              pointerdb.vercel.app
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  )
}
