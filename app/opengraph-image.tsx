import { ImageResponse } from 'next/og';

export const alt = 'Stats Lab — Interactive Statistics Workbench';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#09090b',
          color: '#f4f4f5',
          fontFamily: 'sans-serif',
          position: 'relative',
          padding: '60px',
          boxSizing: 'border-box',
        }}
      >
        {/* Abstract background decorative elements */}
        <div
          style={{
            position: 'absolute',
            top: '-200px',
            left: '-200px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(251,146,60,0.15) 0%, rgba(244,63,94,0.05) 50%, rgba(0,0,0,0) 100%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-200px',
            right: '-200px',
            width: '600px',
            height: '600px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(139,92,246,0.15) 0%, rgba(217,70,239,0.05) 50%, rgba(0,0,0,0) 100%)',
          }}
        />

        {/* Decorative Grid Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.04,
            backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Main Content Card */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            zIndex: 10,
          }}
        >
          {/* Logo Mark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #fb923c 0%, #f43f5e 50%, #8b5cf6 100%)',
              width: '80px',
              height: '80px',
              borderRadius: '24px',
              marginBottom: '24px',
              boxShadow: '0 8px 30px rgba(251, 146, 60, 0.3)',
            }}
          >
            <span style={{ fontSize: 52, color: 'white', fontWeight: 800, marginTop: -4 }}>σ</span>
          </div>

          {/* Title */}
          <h1
            style={{
              fontSize: '64px',
              fontWeight: 800,
              letterSpacing: '-0.025em',
              margin: 0,
              background: 'linear-gradient(110deg, #fafafa 0%, #e4e4e7 100%)',
              backgroundClip: 'text',
              color: 'transparent',
              marginBottom: '16px',
            }}
          >
            Stats Lab
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: '24px',
              fontWeight: 500,
              color: '#a1a1aa',
              margin: 0,
              maxWidth: '800px',
              lineHeight: 1.4,
              marginBottom: '40px',
            }}
          >
            Drop a CSV. See it analyzed across 22 interactive statistical tools.
            Powered by live AI feedback. No sign-up wall.
          </p>

          {/* Badges */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            {[
              '22 Interactive Tools',
              'AI Statistics Tutor',
              'Unified Workspace Context',
              'Zero Paywalls',
            ].map((text) => (
              <div
                key={text}
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  padding: '10px 20px',
                  borderRadius: '999px',
                  fontSize: '15px',
                  fontWeight: 600,
                  color: '#e4e4e7',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                {text}
              </div>
            ))}
          </div>
        </div>

        {/* Footer info */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '14px',
            fontWeight: 500,
            color: '#71717a',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          statslab.io
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
