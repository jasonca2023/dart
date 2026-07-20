import { Composition } from "remotion";
import { ProductAd, productAdSchema } from "./ProductAd";
import { buildAdSpec } from "./adSpec";

const FPS = 60;
const TITLE = "2026 Model HDMI DVD Player for TV";
const IMAGE = "https://m.media-amazon.com/images/I/71Gqkj-OujL._AC_SL1500_.jpg";
const PRICE = "$39.99";
const DURATION = 10;

// One composition per audience so the rule-based brain (buildAdSpec) is exercised
// for real — render any of these to compare the spread.
const VARIANTS = [
  { id: "ProductAd", audience: "everyone" },
  { id: "ProductAd-parents", audience: "Busy parents" },
  { id: "ProductAd-genz", audience: "Gen Z tech enthusiasts" },
  { id: "ProductAd-luxe", audience: "Luxury gift shoppers" },
  { id: "ProductAd-outdoor", audience: "Outdoor adventurers" },
  { id: "ProductAd-bold", audience: "Bold streetwear statement" },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {VARIANTS.map((v) => {
        const spec = buildAdSpec({
          title: TITLE,
          audience: v.audience,
          price: PRICE,
          durationSec: DURATION,
        });
        return (
          <Composition
            key={v.id}
            id={v.id}
            component={ProductAd}
            schema={productAdSchema}
            fps={FPS}
            width={1920}
            height={1080}
            durationInFrames={FPS * DURATION}
            defaultProps={{
              productTitle: TITLE,
              productImage: IMAGE,
              price: PRICE,
              audience: v.audience,
              durationInSeconds: DURATION,
              aspectRatio: "16:9" as const,
              accent: spec.palette.accent,
              spec,
            }}
            calculateMetadata={({ props }) => {
              const dims =
                props.aspectRatio === "9:16"
                  ? { width: 1080, height: 1920 }
                  : props.aspectRatio === "4:5"
                    ? { width: 1080, height: 1350 }
                    : props.aspectRatio === "1:1"
                      ? { width: 1080, height: 1080 }
                      : { width: 1920, height: 1080 };
              return {
                ...dims,
                fps: FPS,
                durationInFrames: Math.max(1, Math.round(props.durationInSeconds * FPS)),
              };
            }}
          />
        );
      })}
    </>
  );
};
