import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export interface ProductAdProps {
  productTitle: string;
  productImage: string;
  price: string;
  audience: string;
  durationInSeconds: number;
  aspectRatio: "16:9" | "9:16";
  accent: string;
}

const FONT =
  '"Hanken Grotesk", "Bricolage Grotesque", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const EMBER = "#ff4704";
const INK = "#070709";

const Wordmark: React.FC<{ accent: string; size: number; color?: string }> = ({
  accent,
  size,
  color = INK,
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: size * 0.34,
      fontSize: size,
      fontWeight: 700,
      letterSpacing: -size * 0.02,
      color,
    }}
  >
    <span
      style={{
        width: size * 0.58,
        height: size * 0.58,
        borderRadius: size * 0.18,
        background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
        boxShadow: `0 ${size * 0.12}px ${size * 0.3}px ${accent}55`,
      }}
    />
    Dart
  </div>
);

export const ProductAd: React.FC<ProductAdProps> = ({
  productTitle,
  productImage,
  price,
  audience,
  accent,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames: D, width, height } = useVideoConfig();
  const portrait = height > width;

  // Staggered reveal helper (spring from a given start frame).
  const reveal = (start: number, dur = 26, damping = 200) =>
    spring({ frame: frame - start, fps, durationInFrames: dur, config: { damping } });

  // Product entrance + slow Ken Burns push.
  const prodIn = reveal(0, 32);
  const kb = interpolate(frame, [0, D], [0, 1], { extrapolateRight: "clamp" });
  const prodScale = interpolate(kb, [0, 1], [1.0, 1.1]);
  const prodY = interpolate(kb, [0, 1], [0, portrait ? -28 : -20]);
  const glow = interpolate(frame, [0, D], [0, 1]);

  // Copy reveals.
  const eyebrow = reveal(14, 24);
  const titleR = reveal(22, 30);
  const priceR = reveal(Math.round(D * 0.4), 24, 15);

  // Outro brand card cross-fade (last ~0.7s).
  const outroStart = D - 24;
  const outro = interpolate(frame, [outroStart, D - 5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const stagePct = 60;
  const pad = portrait ? 70 : 92;
  const titleSize = portrait ? 62 : 60;

  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily: FONT }}>
      {/* ---- Main content (fades out as the outro card takes over) ---- */}
      <AbsoluteFill style={{ opacity: 1 - outro }}>
        {/* Product stage — a lit surface up top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: `${stagePct}%`,
            background: "linear-gradient(180deg, #ffffff 0%, #f1f0ee 100%)",
            overflow: "hidden",
          }}
        >
          <AbsoluteFill
            style={{
              background: `radial-gradient(50% 58% at ${44 + glow * 10}% 42%, ${accent}1a, transparent 64%), radial-gradient(42% 50% at ${82 - glow * 10}% 88%, ${EMBER}12, transparent 62%)`,
            }}
          />
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <div
              style={{
                position: "relative",
                width: portrait ? "78%" : "60%",
                height: "78%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `translateY(${prodY}px) scale(${prodScale})`,
                opacity: prodIn,
              }}
            >
              {/* Contact shadow so the product sits on the surface */}
              <div
                style={{
                  position: "absolute",
                  bottom: "2%",
                  width: "60%",
                  height: "9%",
                  borderRadius: "50%",
                  background:
                    "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.32), transparent 72%)",
                  filter: "blur(6px)",
                }}
              />
              <Img
                src={productImage}
                crossOrigin="anonymous"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                  filter: "drop-shadow(0 20px 42px rgba(0,0,0,0.13))",
                }}
              />
            </div>
          </AbsoluteFill>
          {/* Soft seam into the copy band */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: 90,
              background: `linear-gradient(180deg, transparent, ${INK}14)`,
            }}
          />
        </div>

        {/* Brand mark over the stage */}
        <div style={{ position: "absolute", top: pad * 0.62, left: pad }}>
          <Wordmark accent={accent} size={portrait ? 30 : 32} />
        </div>

        {/* Copy band */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: `${100 - stagePct}%`,
            background: `linear-gradient(180deg, #0c0c12, ${INK})`,
            padding: `0 ${pad}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: portrait ? 18 : 16,
            overflow: "hidden",
          }}
        >
          <AbsoluteFill
            style={{
              background: `radial-gradient(46% 130% at 100% 0%, ${accent}24, transparent 60%)`,
            }}
          />
          {/* Eyebrow chip */}
          <div
            style={{
              position: "relative",
              alignSelf: "flex-start",
              opacity: eyebrow,
              transform: `translateY(${interpolate(eyebrow, [0, 1], [14, 0])}px)`,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              border: `1px solid ${accent}59`,
              background: `${accent}1a`,
              color: "#fff",
              fontSize: portrait ? 19 : 17,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <span
              style={{ width: 8, height: 8, borderRadius: 99, background: accent }}
            />
            For {audience}
          </div>
          {/* Title */}
          <div
            style={{
              position: "relative",
              opacity: titleR,
              transform: `translateY(${interpolate(titleR, [0, 1], [28, 0])}px)`,
              color: "#fff",
              fontWeight: 700,
              fontSize: titleSize,
              lineHeight: 1.02,
              letterSpacing: -1.6,
              maxWidth: portrait ? "15ch" : "20ch",
            }}
          >
            {productTitle}
          </div>
          {/* Price + CTA */}
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 18,
              marginTop: 4,
              opacity: priceR,
              transform: `translateY(${interpolate(priceR, [0, 1], [18, 0])}px)`,
            }}
          >
            {price ? (
              <span
                style={{
                  padding: "12px 22px",
                  borderRadius: 14,
                  background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: portrait ? 34 : 32,
                  boxShadow: `0 16px 34px ${accent}4d`,
                }}
              >
                {price}
              </span>
            ) : null}
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 9,
                color: "#fff",
                fontWeight: 600,
                fontSize: portrait ? 24 : 22,
              }}
            >
              Shop now
              <span
                style={{
                  display: "inline-flex",
                  width: 30,
                  height: 30,
                  borderRadius: 99,
                  background: "#ffffff1f",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 18,
                }}
              >
                →
              </span>
            </span>
          </div>
        </div>

        {/* Progress line */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 5,
            background: "#ffffff14",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${(frame / D) * 100}%`,
              background: `linear-gradient(90deg, ${accent}, ${EMBER})`,
            }}
          />
        </div>
      </AbsoluteFill>

      {/* ---- Outro brand card ---- */}
      <AbsoluteFill
        style={{
          opacity: outro,
          background: `radial-gradient(60% 60% at 50% 38%, ${accent}33, transparent 62%), linear-gradient(180deg, #0b0b12, #050507)`,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 22,
        }}
      >
        <Wordmark accent={accent} size={portrait ? 74 : 86} color="#fff" />
        <div
          style={{
            color: "#b6b3c2",
            fontSize: portrait ? 23 : 22,
            letterSpacing: 0.5,
            maxWidth: "22ch",
            textAlign: "center",
          }}
        >
          {productTitle}
        </div>
        <div
          style={{
            marginTop: 6,
            padding: "14px 30px",
            borderRadius: 999,
            background: `linear-gradient(135deg, ${accent}, ${EMBER})`,
            color: "#fff",
            fontWeight: 700,
            fontSize: 23,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            boxShadow: `0 18px 40px ${accent}4d`,
          }}
        >
          Shop now →
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
